import { Wallet } from "./Wallet";

export interface IWalletRepository {
  findByUserId(userId: string): Promise<Wallet | null>;
  findById(id: string): Promise<Wallet | null>;
  save(wallet: Wallet): Promise<void>;
  create(userId: string): Promise<Wallet>;
  debitAtomic(userId: string, amountKobo: number): Promise<Wallet | null>;
  creditAtomic(userId: string, amountKobo: number): Promise<Wallet | null>;
}
