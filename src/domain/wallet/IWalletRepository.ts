import { Wallet } from "./Wallet";

export interface IWalletRepository {
  findByUserId(userId: string): Promise<Wallet | null>;
  findById(id: string): Promise<Wallet | null>;
  save(wallet: Wallet): Promise<void>;
  create(userId: string): Promise<Wallet>;
}