// Always work in KOBO. Never naira. Never floats.
export class Money {
  private constructor(private readonly amountInKobo: number) {
    if (!Number.isInteger(amountInKobo) || amountInKobo < 0) {
      throw new Error(`Invalid money amount: ${amountInKobo}`);
    }
  }

  static fromKobo(kobo: number): Money {
    return new Money(kobo);
  }

  static fromNaira(naira: number): Money {
    return new Money(Math.round(naira * 100));
  }

  get kobo(): number { return this.amountInKobo; }
  get naira(): number { return this.amountInKobo / 100; }

  add(other: Money): Money { return new Money(this.amountInKobo + other.amountInKobo); }
  subtract(other: Money): Money {
    if (other.amountInKobo > this.amountInKobo) throw new Error("Insufficient funds");
    return new Money(this.amountInKobo - other.amountInKobo);
  }
  percentOf(basisPoints: number): Money {
    // basisPoints: 300 = 3%, 500 = 5%
    return new Money(Math.floor((this.amountInKobo * basisPoints) / 10000));
  }
  isGreaterThan(other: Money): boolean { return this.amountInKobo > other.amountInKobo; }
  equals(other: Money): boolean { return this.amountInKobo === other.amountInKobo; }
  toString(): string { return `₦${this.naira.toLocaleString("en-NG")}`; }
}