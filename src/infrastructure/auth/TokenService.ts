import { SignJWT, jwtVerify, JWTPayload } from "jose";
import { env } from "@config/env";

export interface TokenPayload extends JWTPayload {
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
      return payload as TokenPayload;
    } catch {
      return null;
    }
  }
}
