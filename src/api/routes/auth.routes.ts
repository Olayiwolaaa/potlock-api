import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { RegisterUseCase } from "@application/auth/RegisterUseCase";
import { LoginUseCase } from "@application/auth/LoginUseCase";
import { UserRepository } from "@infrastructure/db/repositories/UserRepository";
import { WalletRepository } from "@infrastructure/db/repositories/WalletRepository";
import { TokenService } from "@infrastructure/auth/TokenService";
import {
  registerBodySchema,
  loginBodySchema,
  authResponseSchema,
  errorResponse,
} from "@api/schemas/auth.schemas";

const userRepo = new UserRepository();
const walletRepo = new WalletRepository();
const tokenService = new TokenService();
const registerUseCase = new RegisterUseCase(userRepo, walletRepo, tokenService);
const loginUseCase = new LoginUseCase(userRepo, tokenService);

const authRoutes = new OpenAPIHono();

// --- Register ---
const registerRoute = createRoute({
  method: "post",
  path: "/register",
  tags: ["Auth"],
  summary: "Create a new account",
  description: "Registers a new user and automatically creates their wallet. Returns a JWT.",
  request: {
    body: {
      content: { "application/json": { schema: registerBodySchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: authResponseSchema } },
      description: "Account created successfully",
    },
    400: {
      content: { "application/json": { schema: errorResponse } },
      description: "Validation error or account already exists",
    },
  },
});

authRoutes.openapi(registerRoute, async (c) => {
  const body = c.req.valid("json");
  const result = await registerUseCase.execute(body);

  if (!result.success) {
    return c.json({ success: false as const, error: result.error }, 400);
  }

  return c.json({ success: true as const, data: result.value }, 201);
});

// --- Login ---
const loginRoute = createRoute({
  method: "post",
  path: "/login",
  tags: ["Auth"],
  summary: "Log into an existing account",
  description: "Authenticates a user by email and password. Returns a JWT.",
  request: {
    body: {
      content: { "application/json": { schema: loginBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: authResponseSchema } },
      description: "Login successful",
    },
    401: {
      content: { "application/json": { schema: errorResponse } },
      description: "Invalid credentials",
    },
  },
});

authRoutes.openapi(loginRoute, async (c) => {
  const body = c.req.valid("json");
  const result = await loginUseCase.execute(body);

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 401);
  }

  return c.json({ success: true, data: result.value }, 200);
});

export { authRoutes };