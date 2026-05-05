import { z } from "zod";

export const registerSchema = z.object({
  email: z.email(),
  phoneNumber: z.string().min(10),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(2).max(30),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});