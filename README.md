# TON deposit indexer

Сервис `ingest + dispatch` для входящих TON-переводов на один кошелек с идентификацией пользователя через text memo. Данные сохраняются в Postgres через Drizzle ORM, а валидные изменения отправляются в один downstream REST endpoint.

Что делает:

- следит за новым masterchain head через TON lite client;
- читает историю транзакций кошелька назад от текущего `lastTx` до последнего сохраненного депозита;
- на первом запуске без сохраненного депозита сканирует всю доступную историю аккаунта;
- сохраняет входящие `internal` переводы в таблицу `deposits_tx`;
- игнорирует bounced-сообщения, не-internal сообщения и переводы с нулевой суммой;
- читает `userId` из стандартного TON text comment (`opcode = 0`);
- добавляет downstream update только если memo после `trim()` не пустой;
- после 60 masterchain blocks повторно верифицирует pending-депозиты и переводит их в `confirmed` или `canceled`;
- отправляет queued updates в один downstream REST-сервис подписанным `POST`;
- пишет структурные логи через `pino` в `stderr`.

Важное ограничение текущей архитектуры: отдельного account sync cursor нет. Курсор чтения строится по последнему сохраненному депозиту. Поэтому недепозитные транзакции после последнего депозита могут перечитываться до появления следующего депозита.

## Быстрый старт

```bash
bun run db:up
bun run db:migrate
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ton_deposits \
TON_WALLET_ADDRESS=EQ... \
DOWNSTREAM_SERVICES_JSON='{"slug":"billing","baseUrl":"https://billing.example.com","processTxPath":"/private-api/deposit/process-tx","signatureHeader":"x-deposit-signature","privateKeyPem":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----"}' \
bun run start
```

Drizzle Studio:

```bash
bun run db:studio
```

## Настройки

Обязательные:

- `DATABASE_URL` - строка подключения к Postgres.
- `TON_WALLET_ADDRESS` - адрес TON-кошелька для индексации.
- `DOWNSTREAM_SERVICES_JSON` - JSON-объект одного downstream-сервиса. Название env осталось во множественном числе для совместимости с существующими деплоями.

Опциональные:

- `TON_NETWORK` - `ton` или `ton-testnet`, по умолчанию `ton`.
- `TON_GLOBAL_CONFIG_URL` - URL TON global config, по умолчанию официальный config выбранной сети.
- `TON_BATCH_SIZE` - размер страницы `getAccountTransactions`, по умолчанию `50`, максимум `100`.
- `TON_POLL_INTERVAL_MS` - интервал опроса masterchain head, по умолчанию `5000`.
- `TON_LOG_LEVEL` - уровень логов `pino`, по умолчанию `info`.

Формат `DOWNSTREAM_SERVICES_JSON`:

```json
{
  "slug": "billing",
  "baseUrl": "https://billing.example.com",
  "processTxPath": "/private-api/deposit/process-tx",
  "signatureHeader": "x-deposit-signature",
  "privateKeyPem": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----"
}
```

`cursorPath` больше не используется. Если он остался в env JSON от старой конфигурации, сервис его проигнорирует.

## Downstream API

Для каждого update сервис делает подписанный `POST` на `baseUrl + processTxPath`.

Подпись считается так:

```ts
crypto.sign(null, Buffer.from(JSON.stringify(payload)), privateKeyPem)
```

Результат кладется в header из `signatureHeader` в base64.

Payload:

```json
{
  "slug": "billing",
  "depositTxId": 123,
  "userId": "user-from-memo",
  "hash": "tx-hash-hex",
  "txStatus": "pending",
  "creditedTokens": 1000,
  "nanoTON": "1000000000",
  "asset": "TON",
  "from": "0:...",
  "initiatedAt": 1751910826000,
  "network": "ton"
}
```

Поля:

- `txStatus` - `pending`, `confirmed` или `canceled`.
- `nanoTON` - сумма в nanotons, сериализуется строкой.
- `creditedTokens` - текущий внутренний расчет `nanoTON * 1000 / 1_000_000_000`.
- `initiatedAt` - epoch milliseconds из `initiatedAt` записи downstream queue.
- `userId` - `memo.trim().slice(0, 64)`.

Если downstream отвечает не-`2xx`, update получает статус `error` и текст ошибки в `downstreamHttpError`. Сетевые ошибки и HTTP-ошибки ретраятся через общий `withRetry`.

## Таблицы

Migrations создают актуальные таблицы:

- `blockId` - сохраненные masterchain block ids.
- `deposits_tx` - входящие депозитные транзакции и их статус.
- `downstream` - локальная очередь отправки downstream updates.

На старте сервис проверяет наличие `__drizzle_migrations`, `blockId`, `deposits_tx` и `downstream`. Если migrations не применены, запуск завершится ошибкой с подсказкой выполнить `bun run db:migrate`.

## Локальная разработка

```bash
bun run db:up
bun run db:migrate
bun run check
bun test
```

Полезные команды:

- `bun run db:up` - поднять локальный Postgres.
- `bun run db:down` - остановить локальный Postgres.
- `bun run db:logs` - смотреть логи контейнера.
- `bun run db:generate` - сгенерировать новую migration после изменения `schema.ts`.
- `bun run db:migrate` - применить migrations.
- `bun run db:studio` - открыть Drizzle Studio.
- `bun run check` - TypeScript check.
- `bun test` - unit tests.

При изменении схемы:

```bash
bun run db:generate -- --name=add-something
bun run db:migrate
```

Watcher не создает таблицы сам.

## Деплой в Railway

Минимальные переменные:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
TON_WALLET_ADDRESS=EQ...
TON_NETWORK=ton
DOWNSTREAM_SERVICES_JSON={"slug":"billing","baseUrl":"https://billing.example.com","processTxPath":"/private-api/deposit/process-tx","signatureHeader":"x-deposit-signature","privateKeyPem":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----"}
```

Рекомендуемые команды Railway service:

```bash
Pre-deploy Command: bun run db:migrate
Start Command: bun run start
```

Не запускайте migrations внутри `Start Command`: при рестартах или нескольких репликах приложение может одновременно пытаться мигрировать БД.
