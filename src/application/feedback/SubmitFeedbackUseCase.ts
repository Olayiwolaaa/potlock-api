// src/application/feedback/SubmitFeedbackUseCase.ts
import type { IEmailService } from "@domain/shared/IEmailService";
import type { IFeedbackRepository } from "@domain/feedback/IFeedbackRepository";
import { feedbackNotificationTemplate } from "@infrastructure/email/templates";
import { env } from "@config/env";
import { logger } from "@infrastructure/logger/logger";

interface SubmitFeedbackInput {
  userId: string;
  userEmail: string;
  displayName: string;
  message: string;
  rating: number;
}

export class SubmitFeedbackUseCase {
  constructor(
    private feedbackRepo: IFeedbackRepository,
    private emailService: IEmailService
  ) {}

  async execute(input: SubmitFeedbackInput) {
    const record = await this.feedbackRepo.create({
      userId: input.userId,
      message: input.message,
      rating: input.rating,
    });

    this.emailService
      .send({
        to: env.FEEDBACK_TO_EMAIL,
        subject: `New feedback (${input.rating}★) — ${input.displayName}`,
        html: feedbackNotificationTemplate(input.displayName, input.rating, input.message),
        replyTo: input.userEmail,
      })
      .catch((err) => logger.error({ err, feedbackId: record.id }, "Feedback email notification failed"));

    return { success: true as const, value: { id: record.id } };
  }
}