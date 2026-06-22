import { eq, and, gte, sql } from "drizzle-orm";
import { db } from "../client";
import { wallets } from "../schema";
import { Wallet } from "@domain/wallet/Wallet";
import { IWalletRepository } from "@domain/wallet/IWalletRepository";
import { randomUUID } from "crypto";

export class WalletRepository implements IWalletRepository {
  private toDomain(record: typeof wallets.$inferSelect): Wallet {
    return Wallet.create({
      id: record.id,
      userId: record.userId,
      balanceKobo: Number(record.balanceKobo),
      createdAt: record.createdAt,
    });
  }

  async findByUserId(userId: string): Promise<Wallet | null> {
    const result = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1);

    return result[0] ? this.toDomain(result[0]) : null;
  }

  async findByUserIdForUpdate(
    userId: string,
    tx: typeof db,
  ): Promise<Wallet | null> {
    const result = await tx.execute(
      sql`SELECT * FROM wallets WHERE user_id = ${userId} LIMIT 1 FOR UPDATE`,
    );

    // postgres-js returns an array-like RowList; neon-http returns { rows: [...] }
    const rows: Record<string, unknown>[] = Array.isArray(result)
      ? result
      : (result as any).rows ?? [];
    const row = rows[0];
    if (!row) return null;

    return Wallet.create({
      id: row.id as string,
      userId: row.user_id as string,
      balanceKobo: Number(row.balance_kobo),
      createdAt: row.created_at as Date,
    });
  }

  async findById(id: string): Promise<Wallet | null> {
    const result = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, id))
      .limit(1);

    return result[0] ? this.toDomain(result[0]) : null;
  }

  async debitAtomic(
    userId: string,
    amountKobo: number,
  ): Promise<Wallet | null> {
    const result = await db
      .update(wallets)
      .set({
        balanceKobo: sql`${wallets.balanceKobo} - ${amountKobo}`,
        updatedAt: new Date(),
      })
      .where(and(eq(wallets.userId, userId), gte(wallets.balanceKobo, amountKobo)))
      .returning();

    return result[0] ? this.toDomain(result[0]) : null;
  }

  async creditAtomic(
    userId: string,
    amountKobo: number,
  ): Promise<Wallet | null> {
    const result = await db
      .update(wallets)
      .set({
        balanceKobo: sql`${wallets.balanceKobo} + ${amountKobo}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, userId))
      .returning();

    return result[0] ? this.toDomain(result[0]) : null;
  }

  async save(wallet: Wallet, tx?: typeof db): Promise<void> {
    const record = wallet.toRecord();
    const conn = tx ?? db;
    await conn
      .update(wallets)
      .set({
        balanceKobo: record.balanceKobo,
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, record.id));
  }

  async create(userId: string): Promise<Wallet> {
    const id = randomUUID();
    const now = new Date();

    await db.insert(wallets).values({
      id,
      userId,
      balanceKobo: 0,
      createdAt: now,
      updatedAt: now,
    });

    return Wallet.create({ id, userId, balanceKobo: 0, createdAt: now });
  }
}