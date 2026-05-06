import { err, ok, Result } from "@domain/shared/Result";
export type UserRole = "user" | "admin";

export class User {
  private constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly phoneNumber: string,
    public readonly passwordHash: string,
    public readonly displayName: string,
    public readonly role: UserRole,
    public readonly isVerified: boolean,
    public readonly createdAt: Date,
    public readonly profileImageUrl: string | null,
    public readonly profileImagePublicId: string | null,
  ) {}

  static create(params: {
    id: string;
    email: string;
    phoneNumber: string;
    passwordHash: string;
    displayName: string;
    role?: UserRole;
    isVerified: boolean;
    createdAt: Date;
    profileImageUrl?: string | null;
    profileImagePublicId?: string | null;
  }): User {
    return new User(
      params.id,
      params.email,
      params.phoneNumber,
      params.passwordHash,
      params.displayName,
      params.role ?? "user",
      params.isVerified,
      params.createdAt,
      params.profileImageUrl ?? null,
      params.profileImagePublicId ?? null,
    );
  }

  get isAdmin(): boolean {
    return this.role === "admin";
  }

  static validateEmail(email: string): Result<string> {
    const trimmed = email.trim();
    if (!trimmed.includes("@")) {
      return err("Invalid email format");
    }
    // Return the normalized version in the Result value
    return ok(trimmed.toLowerCase());
  }

  static validatePhone(phone: string): Result<string> {
    const phoneRegex = /^(?:\+?234|0)[789]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return err("Invalid phone number format");
    }
    return ok(phone);
  }

  toRecord() {
    return {
      id: this.id,
      email: this.email,
      phoneNumber: this.phoneNumber,
      passwordHash: this.passwordHash,
      displayName: this.displayName,
      role: this.role,
      isVerified: this.isVerified,
      createdAt: this.createdAt,
      profileImageUrl: this.profileImageUrl,
      profileImagePublicId: this.profileImagePublicId,
    };
  }
}
