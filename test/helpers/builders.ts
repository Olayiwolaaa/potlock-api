import { User } from "@domain/user/User";
import { Wallet } from "@domain/wallet/Wallet";
import { Challenge } from "@domain/challenge/Challenge";
import { randomUUID } from "crypto";
import { ChallengeWithDetails } from "@domain/challenge/IChallengeRepository";

// ── User builder ──────────────────────────────────────────────────────────────
export function buildUser(overrides: Partial<{
  id: string;
  email: string;
  phoneNumber: string;
  passwordHash: string;
  displayName: string;
  isVerified: boolean;
  createdAt: Date;
}> = {}): User {
  return User.create({
    id: randomUUID(),
    email: "test@test.com",
    phoneNumber: "+2348012345678",
    passwordHash: "hashed_password",
    displayName: "Test User",
    isVerified: false,
    createdAt: new Date(),
    ...overrides,
  });
}

// ── Wallet builder ────────────────────────────────────────────────────────────
export function buildWallet(overrides: Partial<{
  id: string;
  userId: string;
  balanceKobo: number;
  createdAt: Date;
}> = {}): Wallet {
  return Wallet.create({
    id: randomUUID(),
    userId: randomUUID(),
    balanceKobo: 0,
    createdAt: new Date(),
    ...overrides,
  });
}

// ── Challenge builder ─────────────────────────────────────────────────────────
export function buildChallenge(overrides: Partial<{
  id: string;
  creatorId: string;
  opponentId: string | null;
  gameId: string | null;
  platform: "PS" | "XBOX" | "MOBILE" | "PC";
  stakeKobo: number;
  potKobo: number;
  status: "OPEN" | "LOCKED" | "SETTLED" | "DISPUTED" | "CANCELLED";
  linkSlug: string;
  title: string;
  description: string | null;
  expiresAt: Date;
  declaredWinnerId: string | null;
  opponentDeclaredWinnerId: string | null;
  createdAt: Date;
}> = {}): Challenge {
  return Challenge.create({
    id: randomUUID(),
    creatorId: randomUUID(),
    opponentId: null,
    gameId: null,
    platform: "PS",
    stakeKobo: 500_000,
    potKobo: 500_000,
    status: "OPEN",
    linkSlug: "abc12345",
    title: "Test Challenge",
    description: null,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h from now
    declaredWinnerId: null,
    opponentDeclaredWinnerId: null,
    createdAt: new Date(),
    ...overrides,
  });
}

import { IWalletRepository } from "@domain/wallet/IWalletRepository";
import { IUserRepository } from "@domain/user/IUserRepository";
import { IChallengeRepository, OpenChallengeSummary, UserChallengeSummary } from "@domain/challenge/IChallengeRepository";
import { Money } from "@src/domain/shared/Money";

export class MockWalletRepository implements IWalletRepository {
  private store = new Map<string, Wallet>();      
  private byUser = new Map<string, string>(); 

  seed(wallet: Wallet): void {
    this.store.set(wallet.id, wallet);
    this.byUser.set(wallet.userId, wallet.id);
  }

  async findByUserId(userId: string): Promise<Wallet | null> {
    const id = this.byUser.get(userId);
    return id ? (this.store.get(id) ?? null) : null;
  }

  async findById(id: string): Promise<Wallet | null> {
    return this.store.get(id) ?? null;
  }

  async save(wallet: Wallet): Promise<void> {
    this.store.set(wallet.id, wallet);
    this.byUser.set(wallet.userId, wallet.id);
  }

  async create(userId: string): Promise<Wallet> {
    const wallet = buildWallet({ userId, balanceKobo: 0 });
    this.seed(wallet);
    return wallet;
  }

  async debitAtomic(userId: string, amountKobo: number): Promise<Wallet | null> {
    const wallet = await this.findByUserId(userId);
    if (!wallet || wallet.balance.kobo < amountKobo) return null;
    wallet.debit(Money.fromKobo(amountKobo));
    await this.save(wallet);
    return wallet;
  }

  async creditAtomic(userId: string, amountKobo: number): Promise<Wallet | null> {
    const wallet = await this.findByUserId(userId);
    if (!wallet) return null;
    wallet.credit(Money.fromKobo(amountKobo));
    await this.save(wallet);
    return wallet;
  }

}

export class MockUserRepository implements IUserRepository {
  private store = new Map<string, User>();
  private byEmail = new Map<string, string>();
  private byPhone = new Map<string, string>();
  private byGoogleId = new Map<string, string>();

  seed(user: User): void {
    this.store.set(user.id, user);
    this.byEmail.set(user.email, user.id);
    if (user.phoneNumber) {
      this.byPhone.set(user.phoneNumber, user.id);
    }
    if (user.googleId) {
      this.byGoogleId.set(user.googleId, user.id);
    }
  }

  async findById(id: string): Promise<User | null> {
    return this.store.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const id = this.byEmail.get(email);
    return id ? (this.store.get(id) ?? null) : null;
  }

  async findByPhone(phone: string): Promise<User | null> {
    const id = this.byPhone.get(phone);
    return id ? (this.store.get(id) ?? null) : null;
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    const id = this.byGoogleId.get(googleId);
    return id ? (this.store.get(id) ?? null) : null;
  }

  async create(params: {
    id: string;
    email: string;
    phoneNumber: string;
    passwordHash: string;
    displayName: string;
  }): Promise<User> {
    const user = User.create({ ...params, isVerified: false, createdAt: new Date() });
    this.seed(user);
    return user;
  }

  async createFromGoogle(params: {
    id: string;
    email: string;
    displayName: string;
    googleId: string;
    profileImageUrl?: string | null;
  }): Promise<User> {
    const user = User.create({
      ...params,
      isVerified: true,
      createdAt: new Date(),
    });
    this.seed(user);
    return user;
  }

  async linkGoogleId(userId: string, googleId: string): Promise<void> {
    const user = this.store.get(userId);
    if (user) {
      this.byGoogleId.set(googleId, userId);
    }
  }
}

export class MockChallengeRepository implements IChallengeRepository {
  private store = new Map<string, Challenge>();
  private bySlug = new Map<string, string>();
  private creatorUsernames = new Map<string, string>(); 
  private games = new Map<string, { name: string; imageUrl: string | null }>();

  seed(challenge: Challenge): void {
    this.store.set(challenge.id, challenge);
    this.bySlug.set(challenge.linkSlug, challenge.id);
  }

  seedCreatorUsername(creatorId: string, displayName: string): void {
    this.creatorUsernames.set(creatorId, displayName);
  }

  seedGame(gameId: string, game: { name: string; imageUrl: string | null }): void {
    this.games.set(gameId, game);
  }

  async findById(id: string): Promise<Challenge | null> {
    return this.store.get(id) ?? null;
  }

  async findBySlug(slug: string): Promise<Challenge | null> {
    const id = this.bySlug.get(slug);
    return id ? (this.store.get(id) ?? null) : null;
  }

  async findBySlugWithDetails(slug: string): Promise<ChallengeWithDetails | null> {
    const challenge = await this.findBySlug(slug);
    if (!challenge) return null;
    const game = challenge.gameId ? this.games.get(challenge.gameId) : undefined;
    return {
      challenge,
      creator: {
        username: null,
        displayName: this.creatorUsernames.get(challenge.creatorId) ?? null,
        isVerified: false,
        profileImageUrl: null,
        wins: 0,
        losses: 0,
      },
      game: game ? { name: game.name, imageUrl: game.imageUrl, description: null } : null,
    };
  }

  async findBySlugWithCreatorUsername(
    slug: string,
  ): Promise<{ challenge: Challenge; creatorUsername: string | null } | null> {
    const challenge = await this.findBySlug(slug);
    if (!challenge) return null;
    return {
      challenge,
      creatorUsername: this.creatorUsernames.get(challenge.creatorId) ?? null,
    };
  }

  async findByCreatorId(creatorId: string): Promise<Challenge[]> {
    return [...this.store.values()].filter((c) => c.creatorId === creatorId);
  }

  async create(challenge: Challenge): Promise<void> {
    this.seed(challenge);
  }

  async save(challenge: Challenge): Promise<void> {
    this.seed(challenge);
  }

  async findOpenChallenges(opts: {
    limit: number;
    offset: number;
    gameSlug?: string;
    platform?: "PS" | "XBOX" | "MOBILE" | "PC";
  }): Promise<{ challenges: OpenChallengeSummary[]; total: number }> {
    let matches = [...this.store.values()].filter((c) => c.status === "OPEN");

    if (opts.platform) {
      matches = matches.filter((c) => c.platform === opts.platform);
    }
    // gameSlug filtering is skipped — mock has no game/slug relationship;
    // add one if a test actually needs it.

    const total = matches.length;
    const page = matches.slice(opts.offset, opts.offset + opts.limit);

    const challenges: OpenChallengeSummary[] = page.map((c) => {
      const game = c.gameId ? this.games.get(c.gameId) : undefined;
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        platform: c.platform,
        stakeKobo: c.stakeKobo,
        potKobo: c.potKobo,
        status: c.status,
        linkSlug: c.linkSlug,
        creatorUsername: this.creatorUsernames.get(c.creatorId) ?? "Unknown",
        gameName: game?.name ?? null,
        gameImageUrl: game?.imageUrl ?? null,
        expiresAt: c.expiresAt.toISOString(),
        createdAt: c.createdAt.toISOString(),
      };
    });

    return { challenges, total };
  }

  async findByUserIdWithDetails(
    userId: string,
    opts: { limit: number; offset: number },
  ): Promise<{ rows: UserChallengeSummary[]; total: number }> {
    const matches = [...this.store.values()].filter(
      (c) => c.creatorId === userId || c.opponentId === userId,
    );

    const total = matches.length;
    const page = matches.slice(opts.offset, opts.offset + opts.limit);

    const rows: UserChallengeSummary[] = page.map((c) => {
      const game = c.gameId ? this.games.get(c.gameId) : undefined;
      return {
        id: c.id,
        title: c.title,
        platform: c.platform,
        stakeKobo: c.stakeKobo,
        potKobo: c.potKobo,
        status: c.status,
        linkSlug: c.linkSlug,
        role: c.creatorId === userId ? "CREATOR" : "OPPONENT",
        creatorId: c.creatorId,
        opponentId: c.opponentId,
        expiresAt: c.expiresAt.toISOString(),
        createdAt: c.createdAt.toISOString(),
        game: { name: game?.name ?? "Unknown Game", imageUrl: game?.imageUrl ?? null },
        creator: {
          displayName: this.creatorUsernames.get(c.creatorId) ?? "Player",
          isVerified: false,
          wins: 0,
          losses: 0,
        },
      };
    });

    return { rows, total };
  }
}
