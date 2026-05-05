import { Result, ok, err } from "@domain/shared/Result";

export class User {
  private constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly phoneNumber: string,
    public readonly passwordHash: string,
    public readonly displayName: string,
    public readonly isVerified: boolean,
    public readonly createdAt: Date,
  ) {}

  static create(params: {
    id: string;
    email: string;
    phoneNumber: string;
    passwordHash: string;
    displayName: string;
    isVerified: boolean;
    createdAt: Date;
  }): User {
    return new User(
      params.id,
      params.email,
      params.phoneNumber,
      params.passwordHash,
      params.displayName,
      params.isVerified,
      params.createdAt,
    );
  }

  // Domain rule: email must look valid
  static validateEmail(email: string): Result<string> {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return err("Invalid email address");
    return ok(email.toLowerCase().trim());
  }

  // Domain rule: Nigerian phone numbers
  static validatePhone(phone: string): Result<string> {
    const cleaned = phone.replace(/\s+/g, "").replace(/^0/, "+234");
    const phoneRegex = /^\+234[789][01]\d{8}$/;
    if (!phoneRegex.test(cleaned)) return err("Invalid Nigerian phone number");
    return ok(cleaned);
  }

  toRecord() {
    return {
      id: this.id,
      email: this.email,
      phoneNumber: this.phoneNumber,
      passwordHash: this.passwordHash,
      displayName: this.displayName,
      isVerified: this.isVerified,
      createdAt: this.createdAt,
    };
  }
}