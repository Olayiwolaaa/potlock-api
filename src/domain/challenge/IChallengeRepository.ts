import { Challenge } from "./Challenge";

export interface IChallengeRepository {
  findById(id: string): Promise<Challenge | null>;
  findBySlug(slug: string): Promise<Challenge | null>;
  findByCreatorId(creatorId: string): Promise<Challenge[]>;
  create(challenge: Challenge): Promise<void>;
  save(challenge: Challenge): Promise<void>;
}