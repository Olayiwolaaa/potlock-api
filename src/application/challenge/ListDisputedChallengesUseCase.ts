import { Result, ok } from "@domain/shared/Result";
import { DisputeEvidenceRepository } from "@infrastructure/db/repositories/DisputeEvidenceRepository";

interface ListDisputedChallengesInput {
  limit?: number;
  offset?: number;
}

export class ListDisputedChallengesUseCase {
  constructor(private readonly evidenceRepo: DisputeEvidenceRepository) {}

  async execute(
    input: ListDisputedChallengesInput,
  ): Promise<Result<Awaited<ReturnType<DisputeEvidenceRepository["listDisputedForAdmin"]>>>> {
    const result = await this.evidenceRepo.listDisputedForAdmin({
      limit: input.limit ?? 20,
      offset: input.offset ?? 0,
    });
    return ok(result);
  }
}
