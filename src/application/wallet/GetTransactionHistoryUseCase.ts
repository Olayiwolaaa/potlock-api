import { db } from "@infrastructure/db/client";
import { walletTransactions, wallets } from "@infrastructure/db/schema";
import { eq, desc } from "drizzle-orm";
import { Result, ok, err } from "@domain/shared/Result";

interface GetTransactionHistoryInput {
  userId: string;
  limit?: number;
  offset?: number;
}

export interface TransactionItem {
  id: string;
  amountKobo: number;
  type: "CREDIT" | "DEBIT";
  status: "PENDING" | "SUCCESS" | "FAILED";
  purpose: string;
  reference: string;
  note: string | null;
  createdAt: string;
}

interface GetTransactionHistoryOutput {
  transactions: TransactionItem[];
  total: number;
}

export class GetTransactionHistoryUseCase {
  async execute(
    input: GetTransactionHistoryInput,
  ): Promise<Result<GetTransactionHistoryOutput>> {
    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;

    // First find the wallet for this user
    const wallet = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, input.userId))
      .limit(1);

    if (!wallet[0]) return err("Wallet not found");

    // Fetch paginated transactions
    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.walletId, wallet[0].id))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(limit)
        .offset(offset),

      db
        .select({ count: walletTransactions.id })
        .from(walletTransactions)
        .where(eq(walletTransactions.walletId, wallet[0].id)),
    ]);

    return ok({
      transactions: rows.map((row) => ({
        id: row.id,
        amountKobo: Number(row.amountKobo),
        type: row.type,
        status: row.status,
        purpose: row.purpose,
        reference: row.reference,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      })),
      total: countResult.length,
    });
  }
}