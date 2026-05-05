import { eq } from "drizzle-orm";
import { db } from "../client";
import { users } from "../schema";
import { User } from "@domain/user/User";
import { IUserRepository } from "@domain/user/IUserRepository";

export class UserRepository implements IUserRepository {
  private toDomain(record: typeof users.$inferSelect): User {
    return User.create({
      id: record.id,
      email: record.email,
      phoneNumber: record.phoneNumber,
      passwordHash: record.passwordHash,
      displayName: record.displayName,
      isVerified: record.isVerified,
      createdAt: record.createdAt,
    });
  }

  async findById(id: string): Promise<User | null> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return result[0] ? this.toDomain(result[0]) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return result[0] ? this.toDomain(result[0]) : null;
  }

  async findByPhone(phone: string): Promise<User | null> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.phoneNumber, phone))
      .limit(1);
    return result[0] ? this.toDomain(result[0]) : null;
  }

  async create(params: {
    id: string;
    email: string;
    phoneNumber: string;
    passwordHash: string;
    displayName: string;
  }): Promise<User> {
    const now = new Date();
    await db.insert(users).values({
      ...params,
      isVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    return User.create({ ...params, isVerified: false, createdAt: now });
  }
}