import { IUserRepository } from "@domain/user/IUserRepository";
import { TokenService } from "@infrastructure/auth/TokenService";
import { Result, ok, err } from "@domain/shared/Result";

interface LoginInput {
  email: string;
  password: string;
}

interface LoginOutput {
  token: string;
  userId: string;
  displayName: string;
}

export class LoginUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly tokenService: TokenService,
  ) {}

  async execute(input: LoginInput): Promise<Result<LoginOutput>> {
    // 1. Find user by email
    const user = await this.userRepo.findByEmail(input.email.toLowerCase().trim());

    if (!user || !user.passwordHash) return err("Invalid email or password");

    // 2. Verify password against stored hash
    const passwordValid = await Bun.password.verify(
      input.password,
      user.passwordHash,
    );
    if (!passwordValid) return err("Invalid email or password");

    // 3. Issue token
    const token = await this.tokenService.sign({
      userId: user.id,
      email: user.email,
    });

    return ok({ token, userId: user.id, displayName: user.displayName });
  }
}