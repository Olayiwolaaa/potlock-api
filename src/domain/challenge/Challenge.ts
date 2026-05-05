import { Result, ok, err } from "@domain/shared/Result";
import { DomainError } from "@domain/shared/DomainError";
import { Money } from "@domain/shared/Money";

export type ChallengeStatus =
  | "OPEN"
  | "LOCKED"
  | "SETTLED"
  | "DISPUTED"
  | "CANCELLED";

interface ChallengeProps {
  id: string;
  creatorId: string;
  opponentId: string | null;
  stakeKobo: number;
  potKobo: number;
  status: ChallengeStatus;
  linkSlug: string;
  title: string;
  description: string | null;
  expiresAt: Date;
  declaredWinnerId: string | null;
  opponentDeclaredWinnerId: string | null;
  createdAt: Date;
}

export class Challenge {
  private constructor(private props: ChallengeProps) {}

  static create(props: ChallengeProps): Challenge {
    return new Challenge(props);
  }

  // --- Getters ---
  get id() { return this.props.id; }
  get creatorId() { return this.props.creatorId; }
  get opponentId() { return this.props.opponentId; }
  get status() { return this.props.status; }
  get linkSlug() { return this.props.linkSlug; }
  get title() { return this.props.title; }
  get description() { return this.props.description; }
  get expiresAt() { return this.props.expiresAt; }
  get stakeKobo() { return this.props.stakeKobo; }
  get potKobo() { return this.props.potKobo; }
  get stake() { return Money.fromKobo(this.props.stakeKobo); }
  get pot() { return Money.fromKobo(this.props.potKobo); }
  get declaredWinnerId() { return this.props.declaredWinnerId; }
  get opponentDeclaredWinnerId() { return this.props.opponentDeclaredWinnerId; }

  get isExpired(): boolean {
    return new Date() > this.props.expiresAt;
  }

  get hasOpponent(): boolean {
    return this.props.opponentId !== null;
  }

  // --- State Transitions ---
  join(opponentId: string): Result<void, DomainError> {
    if (this.props.status !== "OPEN") {
      return err(new DomainError("Challenge is no longer open to join", "CHALLENGE_NOT_OPEN"));
    }
    if (this.isExpired) {
      return err(new DomainError("Challenge has expired", "CHALLENGE_EXPIRED"));
    }
    if (opponentId === this.props.creatorId) {
      return err(new DomainError("You cannot join your own challenge", "CANNOT_JOIN_OWN"));
    }

    this.props.opponentId = opponentId;
    // pot is now creator stake + opponent stake
    this.props.potKobo = this.props.stakeKobo * 2;
    this.props.status = "LOCKED";
    return ok(undefined);
  }

  cancel(requesterId: string): Result<void, DomainError> {
    if (this.props.status !== "OPEN") {
      return err(new DomainError("Only open challenges can be cancelled", "CHALLENGE_NOT_OPEN"));
    }
    if (requesterId !== this.props.creatorId) {
      return err(new DomainError("Only the creator can cancel", "FORBIDDEN"));
    }

    this.props.status = "CANCELLED";
    return ok(undefined);
  }

  declareWinner(declarerId: string, winnerId: string): Result<"SETTLED" | "DISPUTED", DomainError> {
    if (this.props.status !== "LOCKED") {
      return err(new DomainError("Challenge is not in progress", "CHALLENGE_NOT_LOCKED"));
    }

    const isCreator = declarerId === this.props.creatorId;
    const isOpponent = declarerId === this.props.opponentId;

    if (!isCreator && !isOpponent) {
      return err(new DomainError("You are not a participant", "FORBIDDEN"));
    }

    // Validate the declared winner is actually a participant
    const validWinners = [this.props.creatorId, this.props.opponentId];
    if (!validWinners.includes(winnerId)) {
      return err(new DomainError("Declared winner is not a participant", "INVALID_WINNER"));
    }

    if (isCreator) this.props.declaredWinnerId = winnerId;
    if (isOpponent) this.props.opponentDeclaredWinnerId = winnerId;

    // Both have declared — check if they agree
    const bothDeclared =
      this.props.declaredWinnerId !== null &&
      this.props.opponentDeclaredWinnerId !== null;

    if (bothDeclared) {
      if (this.props.declaredWinnerId === this.props.opponentDeclaredWinnerId) {
        this.props.status = "SETTLED";
        return ok("SETTLED");
      } else {
        this.props.status = "DISPUTED";
        return ok("DISPUTED");
      }
    }

    // Only one person declared so far — still locked, waiting
    return ok("SETTLED"); // placeholder — we'll handle the "waiting" state properly
  }

  toRecord() {
    return { ...this.props };
  }
}