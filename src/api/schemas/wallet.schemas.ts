import { z } from "@hono/zod-openapi";
import { successResponse } from "./common.schemas";

export const walletBalanceSchema = successResponse(
  z.object({
    balanceKobo: z.number().openapi({ example: 500_000 }),
    balanceNaira: z.number().openapi({ example: 5_000 }),
    display: z.string().openapi({ example: "₦5,000" }),
  }),
).openapi("WalletBalance");

export const initializePaymentBodySchema = z.object({
  amountKobo: z.number().int().min(10_000).openapi({
    example: 500_000,
    description: "Amount in kobo. ₦5,000 = 500000. Minimum ₦100 = 10000",
  }),
}).openapi("InitializePaymentBody");

export const initializePaymentResponseSchema = successResponse(
  z.object({
    authorizationUrl: z.string().url().openapi({
      example: "https://checkout.paystack.com/abc123",
      description: "Redirect user to this URL to complete payment",
    }),
    reference: z.string().openapi({ example: "fund_a1b2c3d4e5f6g7h8" }),
  }),
).openapi("InitializePaymentResponse");

export const addBankAccountBodySchema = z.object({
  accountNumber: z.string().length(10).openapi({ example: "0123456789" }),
  bankCode: z.string().openapi({ example: "058", description: "Paystack bank code" }),
  bankName: z.string().openapi({ example: "GTBank" }),
  setAsDefault: z.boolean().default(true),
}).openapi("AddBankAccountBody");

export const bankAccountResponseSchema = successResponse(
  z.object({
    id: z.string().uuid(),
    accountName: z.string().openapi({ example: "JOHN DOE" }),
    accountNumber: z.string().openapi({ example: "0123456789" }),
    bankName: z.string().openapi({ example: "GTBank" }),
    isDefault: z.boolean(),
  }),
).openapi("BankAccountResponse");

export const withdrawBodySchema = z.object({
  amountKobo: z.number().int().min(50_000).openapi({
    example: 200_000,
    description: "Amount in kobo. Minimum ₦500 = 50000. A ₦50 fee will be deducted.",
  }),
  bankAccountId: z.string().uuid().openapi({
    example: "550e8400-e29b-41d4-a716-446655440000",
  }),
}).openapi("WithdrawBody");

export const withdrawResponseSchema = successResponse(
  z.object({
    reference: z.string(),
    amountKobo: z.number(),
    feeKobo: z.number().openapi({ example: 5_000, description: "₦50 flat fee" }),
    netAmountKobo: z.number().openapi({ description: "Amount sent to bank" }),
  }),
).openapi("WithdrawResponse");

export const transactionHistorySchema = successResponse(
  z.object({
    transactions: z.array(
      z.object({
        id: z.string(),
        amountKobo: z.number(),
        type: z.enum(["CREDIT", "DEBIT"]),
        status: z.enum(["PENDING", "SUCCESS", "FAILED"]),
        purpose: z.string(),
        reference: z.string(),
        note: z.string().nullable(),
        createdAt: z.string(),
      }),
    ),
    total: z.number(),
  }),
).openapi("TransactionHistory");

export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
});