import { z } from "@hono/zod-openapi";
import { successResponse } from "./common.schemas";

export const walletBalanceSchema = successResponse(
  z.object({
    balanceKobo: z.number().openapi({ example: 500000 }),
    balanceNaira: z.number().openapi({ example: 5000 }),
    display: z.string().openapi({ example: "₦5,000" }),
  }),
).openapi("WalletBalance");