import { SignJWT, jwtVerify } from "jose";
import { env } from "@config/env";

export interface TokenPayload {
  userId: string;
  email: string;
}

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ALGORITHM = "HS256";
const EXPIRES_IN = "7d";

export class TokenService {
  async sign(payload: TokenPayload): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: ALGORITHM })
      .setIssuedAt()
      .setExpirationTime(EXPIRES_IN)
      .sign(secret);
  }

  async verify(token: string): Promise<TokenPayload | null> {
    try {
      const { payload } = await jwtVerify(token, secret);
      return payload as unknown as TokenPayload;
    } catch {
      // Expired, tampered, or malformed — all treated the same
      return null;
    }
  }
}