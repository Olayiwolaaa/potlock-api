import type { IFeedbackRepository } from "@domain/feedback/IFeedbackRepository";

export class ListFeedbackUseCase {
  constructor(private feedbackRepo: IFeedbackRepository) {}

  async execute(input?: { rating?: number }) {
    const rows = await this.feedbackRepo.list(input);
    return { success: true as const, value: rows };
  }
}