import { eq } from "drizzle-orm";
import { db } from "../client";
import { wallets } from "../schema";
import { Wallet } from "@domain/wallet/Wallet";
import { IWalletRepository } from "@domain/wallet/IWalletRepository";
import { randomUUID } from "crypto";

export class WalletRepository implements IWalletRepository {

  // Map from a DB record to a domain object
  // This is called a "mapper" — it's the bridge between DB and domain
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

  async findById(id: string): Promise<Wallet | null> {
    const result = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, id))
      .limit(1);

    return result[0] ? this.toDomain(result[0]) : null;
  }

  // Save updates an existing wallet (e.g. after crediting/debiting)
  async save(wallet: Wallet): Promise<void> {
    const record = wallet.toRecord();
    await db
      .update(wallets)
      .set({
        balanceKobo: record.balanceKobo,
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, record.id));
  }

  // Create is called once when a new user registers
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