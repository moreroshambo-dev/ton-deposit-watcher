import { z } from "zod";

export const networkSchema = z.enum(["ton", "ton-testnet"]);
export type Network = z.infer<typeof networkSchema>;
