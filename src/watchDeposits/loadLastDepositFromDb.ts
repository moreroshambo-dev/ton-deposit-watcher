import { depositTable } from "~/infrastructure/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { GenericOptionsWithDb } from "~/domain/fn/types";

export const loadLastDepositFromDb = async (options: GenericOptionsWithDb) => {
  const [deposit] = await options.db
    .select()
      .from(depositTable)
      .where(
        and(
          eq(depositTable.network, options.config.network),
          eq(depositTable.to, options.config.address.toRawString()),
        )
      )
      .orderBy(desc(depositTable.lt))
      .limit(1);

  if (!deposit) {
    return undefined
  }

  return deposit
}