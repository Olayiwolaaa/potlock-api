import { z } from "@hono/zod-openapi";
import { successResponse, errorResponse } from "./common.schemas";

export const registerBodySchema = z
  .object({
    email: z.email().openapi({ example: "test@test.com" }),
    phoneNumber: z.string().min(10).openapi({ example: "08012345678" }),
    password: z.string().min(8).openapi({ example: "securepassword123" }),
    displayName: z.string().min(2).max(30).openapi({ example: "Olayiwola Adio" }),
  })
  .openapi("RegisterBody");

export const loginBodySchema = z
  .object({
    email: z.string().email().openapi({ example: "test@test.com" }),
    password: z.string().min(1).openapi({ example: "securepassword123" }),
  })
  .openapi("LoginBody");

export const googleLoginBodySchema = z
  .object({
    idToken: z.string().min(1).openapi({ example: "eyJhbGciOiJSUzI1NiIs..." }),
  })
  .openapi("GoogleLoginBody");

export const authResponseSchema = successResponse(
  z.object({
    token: z.string().openapi({ example: "eyJhbGciOiJIUzI1NiJ9..." }),
    userId: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
    displayName: z.string().openapi({ example: "Olayiwola Adio" }),
  }),
).openapi("AuthResponse");

export const googleAuthResponseSchema = successResponse(
  z.object({
    token: z.string().openapi({ example: "eyJhbGciOiJIUzI1NiJ9..." }),
    userId: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
    displayName: z.string().openapi({ example: "Olayiwola Adio" }),
    isNewUser: z.boolean().openapi({ example: true }),
  }),
).openapi("GoogleAuthResponse");

export { errorResponse };
