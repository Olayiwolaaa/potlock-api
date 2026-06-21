import { IUserRepository } from "@domain/user/IUserRepository";
import { IWalletRepository } from "@domain/wallet/IWalletRepository";
import { TokenService } from "@infrastructure/auth/TokenService";
import { GoogleOAuthService, GoogleUserInfo } from "@src/infrastructure/auth/GoogleOAuthService";
import { Result, ok, err } from "@domain/shared/Result";
import { randomUUID } from "crypto";

interface GoogleLoginOutput {
  token: string;
  userId: string;
  displayName: string;
  isNewUser: boolean;
}

export class GoogleLoginUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly walletRepo: IWalletRepository,
    private readonly tokenService: TokenService,
    private readonly googleOAuth: GoogleOAuthService,
  ) {}

  async execute(idToken: string): Promise<Result<GoogleLoginOutput>> {
    const googleUser = await this.googleOAuth.verifyIdToken(idToken);
    if (!googleUser) return err("Invalid Google token");

    // 1. Check if user already exists by Google ID
    let user = await this.userRepo.findByGoogleId(googleUser.googleId);
    if (user) {
      const token = await this.tokenService.sign({
        userId: user.id,
        email: user.email,
      });
      return ok({ token, userId: user.id, displayName: user.displayName, isNewUser: false });
    }

    // 2. Check if a user with this email already exists (link accounts)
    user = await this.userRepo.findByEmail(googleUser.email.toLowerCase());
    if (user) {
      await this.userRepo.linkGoogleId(user.id, googleUser.googleId);
      const token = await this.tokenService.sign({
        userId: user.id,
        email: user.email,
      });
      return ok({ token, userId: user.id, displayName: user.displayName, isNewUser: false });
    }

    // 3. Create new user
    const userId = randomUUID();
    const newUser = await this.userRepo.createFromGoogle({
      id: userId,
      email: googleUser.email.toLowerCase(),
      displayName: googleUser.name,
      googleId: googleUser.googleId,
      profileImageUrl: googleUser.picture,
    });

    await this.walletRepo.create(newUser.id);

    const token = await this.tokenService.sign({
      userId: newUser.id,
      email: newUser.email,
    });

    return ok({ token, userId: newUser.id, displayName: newUser.displayName, isNewUser: true });
  }
}
