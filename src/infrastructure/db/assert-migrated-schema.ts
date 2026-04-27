import type { Sql } from "postgres";
import type { Logger } from "pino";

type SchemaPresenceRow = {
  downstreamDeliveryAttempts: string | null;
  downstreamServices: string | null;
  incomingTransfers: string | null;
  migrations: string | null;
  syncCursors: string | null;
};

export async function assertMigratedSchema(args: {
  client: Sql;
  logger: Logger;
}): Promise<void> {
  const log = args.logger.child({ scope: "db_schema_guard" });
  const [row] = await args.client.unsafe<SchemaPresenceRow[]>(`
    SELECT
      to_regclass('public.__drizzle_migrations') AS migrations,
      to_regclass('public.downstream_delivery_attempts') AS "downstreamDeliveryAttempts",
      to_regclass('public.downstream_services') AS "downstreamServices",
      to_regclass('public.incoming_transfers') AS "incomingTransfers",
      to_regclass('public.sync_cursors') AS "syncCursors"
  `);

  const missingRelations = [
    row?.migrations ? null : "__drizzle_migrations",
    row?.downstreamDeliveryAttempts ? null : "downstream_delivery_attempts",
    row?.downstreamServices ? null : "downstream_services",
    row?.incomingTransfers ? null : "incoming_transfers",
    row?.syncCursors ? null : "sync_cursors",
  ].filter((value): value is string => value !== null);

  if (missingRelations.length > 0) {
    throw new Error(
      `Database schema is not initialized. Missing relations: ${missingRelations.join(", ")}. Run 'bun run db:migrate' and retry.`,
    );
  }

  log.info("Verified database schema migrations");
}
