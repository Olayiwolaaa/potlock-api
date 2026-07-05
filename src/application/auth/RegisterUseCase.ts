import { IUserRepository } from "@domain/user/IUserRepository";
import { IWalletRepository } from "@domain/wallet/IWalletRepository";
import { User } from "@domain/user/User";
import { TokenService } from "@infrastructure/auth/TokenService";
import { Result, ok, err } from "@domain/shared/Result";
import { randomUUID } from "crypto";
import { IEmailService } from "@domain/shared/IEmailService";
import { logger } from "@infrastructure/logger/logger";
import { welcomeEmailTemplate } from "@infrastructure/email/templates";

interface RegisterInput {
  email: string;
  phoneNumber: string;
  password: string;
  displayName: string;
}

interface RegisterOutput {
  token: string;
  userId: string;
  displayName: string;
}

export class RegisterUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly walletRepo: IWalletRepository,
    private readonly tokenService: TokenService,
    private readonly emailService: IEmailService
  ) {}

  async execute(input: RegisterInput): Promise<Result<RegisterOutput>> {
    // 1. Validate email format (domain rule)
    const emailResult = User.validateEmail(input.email);
    if (!emailResult.success) return err(emailResult.error);

    // 2. Validate phone format (domain rule)
    const phoneResult = User.validatePhone(input.phoneNumber);
    if (!phoneResult.success) return err(phoneResult.error);

    const email = emailResult.value;
    const phoneNumber = phoneResult.value;

    // 3. Check email isn't already taken
    const existingByEmail = await this.userRepo.findByEmail(email);
    if (existingByEmail)
      return err("An account with this email already exists");

    // 4. Check phone isn't already taken
    const existingByPhone = await this.userRepo.findByPhone(phoneNumber);
    if (existingByPhone)
      return err("An account with this phone number already exists");

    // 5. Hash password — Bun has this built in, no bcrypt needed
    const passwordHash = await Bun.password.hash(input.password, {
      algorithm: "bcrypt",
      cost: 10,
    });

    // 6. Create the user
    const userId = randomUUID();
    const user = await this.userRepo.create({
      id: userId,
      email,
      phoneNumber,
      passwordHash,
      displayName: input.displayName.trim(),
    });

    // fire-and-forget — don't block signup on email delivery
    this.emailService
      .send({
        to: user.email,
        subject: "Welcome to Potlock",
        html: welcomeEmailTemplate(user.displayName),
      })
      .catch((err) => logger.error({ err }, "Welcome email failed"));

    // 7. Automatically create a wallet for the new user
    // Every user gets a wallet — no separate step needed
    await this.walletRepo.create(user.id);

    // 8. Issue a JWT
    const token = await this.tokenService.sign({
      userId: user.id,
      email: user.email,
    });

    return ok({ token, userId: user.id, displayName: user.displayName });
  }
}
