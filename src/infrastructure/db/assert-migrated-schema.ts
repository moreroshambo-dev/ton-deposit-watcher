import type { Logger } from "pino";
import type { Sql } from "postgres";

type SchemaPresenceRow = {
  blockId: string | null;
  depositsTx: string | null;
  downstream: string | null;
  migrations: string | null;
};

export async function assertMigratedSchema(args: {
  client: Sql;
  logger: Logger;
}): Promise<void> {
  const log = args.logger.child({ scope: "db_schema_guard" });
  const [row] = await args.client.unsafe<SchemaPresenceRow[]>(`
    SELECT
      to_regclass('public.__drizzle_migrations') AS "migrations",
      to_regclass('public."blockId"') AS "blockId",
      to_regclass('public.deposits_tx') AS "depositsTx",
      to_regclass('public.downstream') AS "downstream"
  `);

  const missingRelations = [
    row?.migrations ? null : "__drizzle_migrations",
    row?.blockId ? null : "blockId",
    row?.depositsTx ? null : "deposits_tx",
    row?.downstream ? null : "downstream",
  ].filter((value): value is string => value !== null);

  if (missingRelations.length > 0) {
    throw new Error(
      `Database schema is not initialized. Missing relations: ${missingRelations.join(", ")}. Run 'bun run db:migrate' and retry.`,
    );
  }

  log.info("Verified database schema migrations");
}
