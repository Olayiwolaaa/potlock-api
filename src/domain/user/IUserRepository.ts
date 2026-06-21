import { User } from "./User";

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  findByGoogleId(googleId: string): Promise<User | null>;
  create(params: {
    id: string;
    email: string;
    phoneNumber: string;
    passwordHash: string;
    displayName: string;
  }): Promise<User>;
  createFromGoogle(params: {
    id: string;
    email: string;
    displayName: string;
    googleId: string;
    profileImageUrl?: string | null;
  }): Promise<User>;
  linkGoogleId(userId: string, googleId: string): Promise<void>;
}
