import { describe, it, expect, beforeEach } from "bun:test";
import { RegisterUseCase } from "@application/auth/RegisterUseCase";
import {
  MockUserRepository,
  MockWalletRepository,
} from "../../helpers/builders";
import { TokenService } from "@infrastructure/auth/TokenService";

// Lightweight mock TokenService — no real crypto in unit tests
class MockTokenService extends TokenService {
  async sign(): Promise<string> {
    return "mock.jwt.token";
  }
}

describe("RegisterUseCase", () => {
  let userRepo: MockUserRepository;
  let walletRepo: MockWalletRepository;
  let useCase: RegisterUseCase;

  const validInput = {
    email: "test@test.com",
    phoneNumber: "08012345678",
    password: "securepassword",
    displayName: "Olayiwola Adio",
  };

  beforeEach(() => {
    userRepo = new MockUserRepository();
    walletRepo = new MockWalletRepository();
    useCase = new RegisterUseCase(userRepo, walletRepo, new MockTokenService());
  });

  it("registers a new user successfully", async () => {
    const result = await useCase.execute(validInput);
    expect(result.success).toBe(true);
  });

  it("returns a token on success", async () => {
    const result = await useCase.execute(validInput);
    if (!result.success) throw new Error("Expected success");
    expect(result.value.token).toBe("mock.jwt.token");
  });

  it("returns the userId on success", async () => {
    const result = await useCase.execute(validInput);
    if (!result.success) throw new Error("Expected success");
    expect(result.value.userId).toBeTruthy();
  });

  it("automatically creates a wallet for the new user", async () => {
    const result = await useCase.execute(validInput);
    if (!result.success) throw new Error("Expected success");

    const wallet = await walletRepo.findByUserId(result.value.userId);
    expect(wallet).not.toBeNull();
    expect(wallet?.balance.kobo).toBe(0);
  });

  it("fails when email is already taken", async () => {
    await useCase.execute(validInput);
    const result = await useCase.execute(validInput);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected failure");
    expect(result.error).toContain("email");
  });

  it("fails when phone is already taken", async () => {
    await useCase.execute(validInput);
    const result = await useCase.execute({
      ...validInput,
      email: "different@test.com",
    });
    expect(result.success).toBe(false);
  });

  it("fails with invalid email", async () => {
    const result = await useCase.execute({ ...validInput, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("fails with invalid Nigerian phone number", async () => {
    const result = await useCase.execute({
      ...validInput,
      phoneNumber: "12345",
    });
    expect(result.success).toBe(false);
  });

  it("normalises email to lowercase", async () => {
    const result = await useCase.execute({
      ...validInput,
      email: "test@TEST.COM",
    });
    if (!result.success) throw new Error("Expected success");

    const user = await userRepo.findByEmail("test@test.com");
    expect(user).not.toBeNull();
  });
});