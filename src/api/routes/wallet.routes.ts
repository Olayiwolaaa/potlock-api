import { GetTransactionHistoryUseCase } from "@application/wallet/GetTransactionHistoryUseCase";
import {
  transactionHistorySchema,
  paginationQuery,
  bankListSchema,
  bankAccountListSchema,
} from "@api/schemas/wallet.schemas";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { requireAuth } from "@api/middleware/auth";
import { WalletRepository } from "@infrastructure/db/repositories/WalletRepository";
import { UserRepository } from "@infrastructure/db/repositories/UserRepository";
import { PaystackAdapter } from "@infrastructure/payment/PaystackAdapter";
import { InitializePaymentUseCase } from "@application/wallet/InitializePaymentUseCase";
import { AddBankAccountUseCase } from "@application/wallet/AddBankAccountUseCase";
import { WithdrawUseCase } from "@application/wallet/WithdrawUseCase";
import { errorResponse } from "@api/schemas/common.schemas";
import {
  walletBalanceSchema,
  initializePaymentBodySchema,
  initializePaymentResponseSchema,
  addBankAccountBodySchema,
  bankAccountResponseSchema,
  withdrawBodySchema,
  withdrawResponseSchema,
} from "@api/schemas/wallet.schemas";
import type { AppEnv } from "@api/types";
import { db } from "@infrastructure/db/client";
import { bankAccounts } from "@infrastructure/db/schema";
import { eq } from "drizzle-orm";

const walletRepo = new WalletRepository();
const userRepo = new UserRepository();
const paystack = new PaystackAdapter();
const initializePayment = new InitializePaymentUseCase(userRepo, paystack);
const addBankAccount = new AddBankAccountUseCase(paystack);
const withdraw = new WithdrawUseCase(walletRepo, paystack);
const getTransactionHistory = new GetTransactionHistoryUseCase();
const walletRoutes = new OpenAPIHono<AppEnv>();

let banksCache: { name: string; code: string; slug: string }[] | null = null;
let banksCacheAt = 0;
const BANKS_CACHE_TTL_MS = 60 * 60 * 1000;


walletRoutes.use("*", requireAuth);

// --- Get Balance ---
walletRoutes.openapi(
  createRoute({
    method: "get",
    path: "/balance",
    tags: ["Wallet"],
    summary: "Get wallet balance",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        content: { "application/json": { schema: walletBalanceSchema } },
        description: "Balance",
      },
      401: {
        content: { "application/json": { schema: errorResponse } },
        description: "Unauthorized",
      },
      404: {
        content: { "application/json": { schema: errorResponse } },
        description: "Wallet not found",
      },
    },
  }),
  async (c) => {
    const userId = c.get("userId");
    const wallet = await walletRepo.findByUserId(userId);
    if (!wallet) {
      return c.json({ success: false as const, error: "Wallet not found" }, 404);
    }

    return c.json({
      success: true as const,
      data: {
        balanceKobo: wallet.balance.kobo,
        balanceNaira: wallet.balance.naira,
        display: wallet.balance.toString(),
      },
    }, 200);
  },
);

// --- Transaction History ---
walletRoutes.openapi(
  createRoute({
    method: "get",
    path: "/transactions",
    tags: ["Wallet"],
    summary: "Get transaction history",
    description:
      "Paginated list of all wallet movements — funding, withdrawals, stakes, winnings.",
    security: [{ bearerAuth: [] }],
    request: { query: paginationQuery },
    responses: {
      200: {
        content: { "application/json": { schema: transactionHistorySchema } },
        description: "Transaction history",
      },
      400: {
        content: { "application/json": { schema: errorResponse } },
        description: "Bad request",
      },
    },
  }),
  async (c) => {
    const userId = c.get("userId");
    const { limit, offset } = c.req.valid("query");

    const result = await getTransactionHistory.execute({
      userId,
      limit,
      offset,
    });
    if (!result.success)
      return c.json({ success: false as const, error: result.error }, 400);

    return c.json({ success: true as const, data: result.value }, 200);
  },
);

// --- Initialize Payment ---
walletRoutes.openapi(
  createRoute({
    method: "post",
    path: "/fund",
    tags: ["Wallet"],
    summary: "Initialize wallet funding via Paystack",
    description:
      "Returns a Paystack checkout URL. Redirect the user there to complete payment.",
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": { schema: initializePaymentBodySchema },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: initializePaymentResponseSchema },
        },
        description: "Checkout URL",
      },
      400: {
        content: { "application/json": { schema: errorResponse } },
        description: "Invalid amount",
      },
    },
  }),
  async (c) => {
    const { amountKobo } = c.req.valid("json");
    const userId = c.get("userId");

    const result = await initializePayment.execute({ userId, amountKobo });
    if (!result.success)
      return c.json({ success: false as const, error: result.error }, 400);

    return c.json({ success: true as const, data: result.value }, 200);
  },
);

// --- Add Bank Account ---
walletRoutes.openapi(
  createRoute({
    method: "post",
    path: "/bank-accounts",
    tags: ["Wallet"],
    summary: "Add and verify a bank account",
    description:
      "Verifies the account with the bank and saves it for withdrawals.",
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: { "application/json": { schema: addBankAccountBodySchema } },
        required: true,
      },
    },
    responses: {
      201: {
        content: { "application/json": { schema: bankAccountResponseSchema } },
        description: "Account added",
      },
      400: {
        content: { "application/json": { schema: errorResponse } },
        description: "Verification failed",
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const userId = c.get("userId");

    const result = await addBankAccount.execute({ userId, ...body });
    if (!result.success)
      return c.json({ success: false as const, error: result.error }, 400);

    return c.json({ success: true as const, data: result.value }, 201);
  },
);

// --- List Bank Accounts ---
walletRoutes.openapi(
  createRoute({
    method: "get",
    path: "/bank-accounts",
    tags: ["Wallet"],
    summary: "List saved bank accounts",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        content: { "application/json": { schema: bankAccountListSchema } },
        description: "Bank accounts",
      },
    },
  }),
  async (c) => {
    const userId = c.get("userId");
    const accounts = await db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.userId, userId));

    return c.json({
      success: true as const,
      data: accounts.map((a) => ({
        id: a.id,
        accountName: a.accountName,
        accountNumber: a.accountNumber,
        bankName: a.bankName,
        isDefault: a.isDefault,
      })),
    }, 200);
  },
);

// --- List Banks ---
walletRoutes.openapi(
  createRoute({
    method: "get",
    path: "/banks",
    tags: ["Wallet"],
    summary: "List banks supported for withdrawal (via Paystack)",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        content: { "application/json": { schema: bankListSchema } },
        description: "Supported banks",
      },
      400: {
        content: { "application/json": { schema: errorResponse } },
        description: "Failed to fetch bank list",
      },
    },
  }),
  async (c) => {
    const now = Date.now();
    if (!banksCache || now - banksCacheAt > BANKS_CACHE_TTL_MS) {
      const banks = await paystack.listBanks();
      if (banks.length > 0) {
        banksCache = banks.map((b) => ({
          name: b.name,
          code: b.code,
          slug: b.slug,
        }));
        banksCacheAt = now;
      } else if (!banksCache) {
        return c.json(
          { success: false as const, error: "Failed to fetch bank list" },
          400,
        );
      }
    }

    return c.json({ success: true as const, data: banksCache }, 200);
  },
);

// --- Withdraw ---
walletRoutes.openapi(
  createRoute({
    method: "post",
    path: "/withdraw",
    tags: ["Wallet"],
    summary: "Withdraw to bank account",
    description:
      "Debits your wallet and sends the amount to your bank. A ₦50 processing fee applies.",
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: { "application/json": { schema: withdrawBodySchema } },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: withdrawResponseSchema } },
        description: "Withdrawal initiated",
      },
      400: {
        content: { "application/json": { schema: errorResponse } },
        description: "Insufficient funds or invalid account",
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const userId = c.get("userId");

    const result = await withdraw.execute({ userId, ...body });
    if (!result.success)
      return c.json({ success: false as const, error: result.error }, 400);

    return c.json({ success: true as const, data: result.value }, 200);
  },
);

export { walletRoutes };