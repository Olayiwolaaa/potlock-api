import type { Feedback } from "./Feedback";

export interface CreateFeedbackInput {
  userId: string;
  message: string;
  rating: number;
}

export interface IFeedbackRepository {
  create(input: CreateFeedbackInput): Promise<Feedback>;
  list(filter?: { rating?: number }): Promise<Feedback[]>;
}