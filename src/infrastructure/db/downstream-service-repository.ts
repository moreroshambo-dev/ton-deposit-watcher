import { eq } from "drizzle-orm";
import type { Logger } from "pino";

import type { DownstreamService } from "../../domain/deposit-delivery/types";
import type { AppDatabaseExecutor } from "./client";
import { downstreamServicesTable } from "./schema";

export async function loadEnabledDownstreamServices(args: {
  db: AppDatabaseExecutor;
  logger: Logger;
}): Promise<DownstreamService[]> {
  const log = args.logger.child({ scope: "downstream_service_repository" });
  const services = await args.db
    .select()
    .from(downstreamServicesTable)
    .where(eq(downstreamServicesTable.enabled, true));

  log.debug({ enabledServices: services.length }, "Loaded enabled downstream services");

  return services;
}

export async function loadEnabledDownstreamServiceIds(args: {
  db: AppDatabaseExecutor;
}): Promise<number[]> {
  const rows = await args.db
    .select({
      id: downstreamServicesTable.id,
    })
    .from(downstreamServicesTable)
    .where(eq(downstreamServicesTable.enabled, true));

  return rows.map((row) => row.id);
}
