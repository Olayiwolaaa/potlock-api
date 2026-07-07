import { IChallengeRepository } from "@domain/challenge/IChallengeRepository";
import { Result, ok, err } from "@domain/shared/Result";
import { DisputeEvidenceRepository } from "@infrastructure/db/repositories/DisputeEvidenceRepository";

interface ListDisputeEvidenceInput {
  challengeId: string;
  requesterId: string;
  isAdmin: boolean;
}

export class ListDisputeEvidenceUseCase {
  constructor(
    private readonly challengeRepo: IChallengeRepository,
    private readonly evidenceRepo: DisputeEvidenceRepository,
  ) {}

  async execute(input: ListDisputeEvidenceInput): Promise<Result<Awaited<ReturnType<DisputeEvidenceRepository["findByChallengeId"]>>>> {
    const challenge = await this.challengeRepo.findById(input.challengeId);
    if (!challenge) return err("Challenge not found");

    // Admins can review any dispute; everyone else can only see evidence
    // for a challenge they're actually part of.
    if (!input.isAdmin && !challenge.isParticipant(input.requesterId)) {
      return err("You are not a participant in this challenge");
    }

    const evidence = await this.evidenceRepo.findByChallengeId(input.challengeId);
    return ok(evidence);
  }
}
