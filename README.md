# TON deposit indexer prototype

Прототип watcher-а для входящих TON-переводов по схеме `one address + memo` c сохранением в Postgres через `drizzle ORM`.

Что делает:

- на старте проходит всю историю транзакций кошелька;
- после этого остается запущенным и следит за новыми блоками и новыми транзакциями кошелька;
- при каждом изменении истории кошелька дочитывает только новые транзакции после сохраненного курсора;
- сохраняет входящие депозиты в БД;
- хранит курсор с последней обработанной транзакцией и masterchain-блоком в БД;
- парсит только входящие `internal` переводы в адрес кошелька;
- игнорирует bounced-сообщения;
- вытаскивает memo из стандартного text comment `opcode = 0`.
- пишет структурные логи через `pino` в `stderr`, а в `stdout` отдает NDJSON-события `sync_result`.

## Быстрый старт

```bash
cp .env.example .env
bun run db:up
bun run db:migrate
bun run start
```

Потом можно открыть Drizzle Studio:

```bash
bun run db:studio
```

## Запуск без Docker

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ton_deposits TON_WALLET_ADDRESS=EQ... bun run start
```

## Настройки

- `TON_WALLET_ADDRESS` - адрес кошелька, обязателен
- `DATABASE_URL` - строка подключения к Postgres, обязательно
- `TON_NETWORK` - `mainnet` или `testnet`, по умолчанию `mainnet`
- `TON_GLOBAL_CONFIG_URL` - URL TON global config, по умолчанию официальный config для выбранной сети
- `TON_BATCH_SIZE` - размер страницы `getAccountTransactions`, по умолчанию `50`
- `TON_POLL_INTERVAL_MS` - интервал опроса новых блоков, по умолчанию `5000`
- `TON_LOG_LEVEL` - уровень логов `pino`, по умолчанию `info`

## Локальная разработка

Для локальной разработки в репозитории уже есть готовый контур:

- `docker-compose.yml` поднимает Postgres 16 на `localhost:5432`
- `drizzle.config.ts` смотрит в `./src/infrastructure/db/schema.ts`
- `bun run db:generate` генерирует SQL migration из текущей Drizzle schema
- `bun run db:migrate` применяет сгенерированные SQL migrations к локальной БД
- `bun run db:studio` открывает Drizzle Studio для просмотра таблиц

Рекомендуемый workflow:

```bash
cp .env.example .env
bun run db:up
bun run db:migrate
bun run start
```

Полезные команды:

- `bun run db:up` - поднять локальный Postgres
- `bun run db:down` - остановить локальный Postgres
- `bun run db:logs` - смотреть логи контейнера
- `bun run db:generate` - сгенерировать новую migration после изменения `schema.ts`
- `bun run db:migrate` - применить все еще не примененные migrations
- `bun run db:studio` - открыть Drizzle Studio

При изменении схемы workflow такой:

```bash
bun run db:generate -- --name=add-something
bun run db:migrate
```

Watcher больше не создает таблицы сам. Если migrations не применены, он завершится с явной ошибкой и попросит выполнить `bun run db:migrate`.

## Формат stdout

Watcher пишет в `stdout` JSON Lines. Каждая строка - отдельное событие:

- `eventType: "sync_result"`
- `emittedAt`
- `result`

`result` содержит:

- `incomingTransfers` - новые входящие переводы в хронологическом порядке;
- `scannedTransactions` - сколько новых транзакций кошелька было просмотрено с прошлого sync-а;
- `cursorAfter` - новый курсор, уже записанный в БД.

Стартовый sync всегда эмитится в `stdout`. Дальше новые строки в `stdout` появляются только если у кошелька была новая активность.

## Таблицы

Migrations создают таблицы:

- `incoming_transfers`
- `sync_cursors`

Логи содержат:

- старт и итог синка;
- факт загрузки или отсутствия cursor-а в БД;
- открытие Postgres connection и проверку applied migrations;
- загрузку lite servers и создание lite client;
- текущий snapshot кошелька;
- статистику обхода истории и фильтрации транзакций;
- отдельный `info`-лог на каждый депозит после успешной записи в БД, с адресом получателя, адресом отправителя, memo и суммой TON.

## Ограничения прототипа

- memo читается только из стандартного text comment (`opcode 0`);
- если курсорный tx не найден в истории, скрипт падает специально, чтобы не задвоить депозиты;
- если кошелек станет `nonexist` и lite server перестанет отдавать `lastTx`, этот прототип тоже завершится ошибкой, потому что безопасно продолжить без риска пропусков уже нельзя.
