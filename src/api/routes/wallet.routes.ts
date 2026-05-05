import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { requireAuth } from "@api/middleware/auth";
import { WalletRepository } from "@infrastructure/db/repositories/WalletRepository";
import { NotFoundError } from "@domain/shared/DomainError";
import { walletBalanceSchema } from "@api/schemas/wallet.schemas";
import { errorResponse } from "@api/schemas/common.schemas";
import { AppEnv } from "@api/types";

const walletRepo = new WalletRepository();
const walletRoutes = new OpenAPIHono<AppEnv>();

walletRoutes.use("*", requireAuth);

const getBalanceRoute = createRoute({
  method: "get",
  path: "/balance",
  tags: ["Wallet"],
  summary: "Get wallet balance",
  description: "Returns the authenticated user's current internal wallet balance.",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: { "application/json": { schema: walletBalanceSchema } },
      description: "Current wallet balance",
    },
    401: {
      content: { "application/json": { schema: errorResponse } },
      description: "Missing or invalid token",
    },
    404: {
      content: { "application/json": { schema: errorResponse } },
      description: "Wallet not found",
    },
  },
});

walletRoutes.openapi(getBalanceRoute, async (c) => {
  const userId = c.get("userId");
  const wallet = await walletRepo.findByUserId(userId);
  if (!wallet) throw new NotFoundError("Wallet");

  return c.json({
    success: true,
    data: {
      balanceKobo: wallet.balance.kobo,
      balanceNaira: wallet.balance.naira,
      display: wallet.balance.toString(),
    },
  });
});

export { walletRoutes };