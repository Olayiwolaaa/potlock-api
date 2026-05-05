import { Money } from "@domain/shared/Money";
import { Result, ok, err } from "@domain/shared/Result";
import { InsufficientFundsError } from "@domain/shared/DomainError";

// This represents a wallet in your business logic
// It has no idea what Drizzle or PostgreSQL is
export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly userId: string,
    private _balanceKobo: number,
    public readonly createdAt: Date,
  ) {}

  // Factory method — the only way to create a Wallet object
  static create(params: {
    id: string;
    userId: string;
    balanceKobo: number;
    createdAt: Date;
  }): Wallet {
    return new Wallet(
      params.id,
      params.userId,
      params.balanceKobo,
      params.createdAt,
    );
  }

  get balance(): Money {
    return Money.fromKobo(this._balanceKobo);
  }

  // Business rule: crediting always succeeds if amount is valid
  credit(amount: Money): Result<void> {
    if (amount.kobo <= 0) return err("Credit amount must be positive");
    this._balanceKobo += amount.kobo;
    return ok(undefined);
  }

  // Business rule: you can't debit more than your balance
  debit(amount: Money): Result<void, InsufficientFundsError> {
    if (amount.kobo <= 0) return err(new InsufficientFundsError());
    if (amount.kobo > this._balanceKobo) return err(new InsufficientFundsError());
    this._balanceKobo -= amount.kobo;
    return ok(undefined);
  }

  // What we'll persist back to DB
  toRecord() {
    return {
      id: this.id,
      userId: this.userId,
      balanceKobo: this._balanceKobo,
    };
  }
}