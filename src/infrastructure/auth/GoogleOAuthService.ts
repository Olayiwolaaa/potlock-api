import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "@config/env";

export interface GoogleUserInfo {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

export class GoogleOAuthService {
  async verifyIdToken(idToken: string): Promise<GoogleUserInfo | null> {
    try {
      const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: env.GOOGLE_CLIENT_ID,
      });

      if (!payload.sub || !payload.email) return null;

      return {
        googleId: payload.sub,
        email: payload.email as string,
        name: (payload.name as string) ?? (payload.email as string),
        picture: payload.picture as string | undefined,
      };
    } catch {
      return null;
    }
  }
}
