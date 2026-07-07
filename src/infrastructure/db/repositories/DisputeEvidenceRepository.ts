import { db } from "@infrastructure/db/client";
import { disputeEvidence, challenges, users } from "@infrastructure/db/schema";
import { and, count, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export interface CreateDisputeEvidenceInput {
  challengeId: string;
  submittedBy: string;
  mediaType: "IMAGE" | "VIDEO";
  mediaUrl: string;
  mediaPublicId: string;
  fileSizeBytes: number;
  note?: string;
}

const opponents = alias(users, "dispute_opponents");

export class DisputeEvidenceRepository {
  async create(input: CreateDisputeEvidenceInput) {
    const [row] = await db.insert(disputeEvidence).values(input).returning();
    return row;
  }

  async findByChallengeId(challengeId: string) {
    const rows = await db
      .select({
        id: disputeEvidence.id,
        challengeId: disputeEvidence.challengeId,
        submittedBy: disputeEvidence.submittedBy,
        submitterName: users.displayName,
        mediaType: disputeEvidence.mediaType,
        mediaUrl: disputeEvidence.mediaUrl,
        mediaPublicId: disputeEvidence.mediaPublicId,
        fileSizeBytes: disputeEvidence.fileSizeBytes,
        note: disputeEvidence.note,
        createdAt: disputeEvidence.createdAt,
      })
      .from(disputeEvidence)
      .leftJoin(users, eq(disputeEvidence.submittedBy, users.id))
      .where(eq(disputeEvidence.challengeId, challengeId))
      .orderBy(desc(disputeEvidence.createdAt));

    return rows.map((r) => ({
      ...r,
      fileSizeBytes: Number(r.fileSizeBytes),
      submitterName: r.submitterName ?? "Player",
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // Cheap abuse guard — caps how much evidence a single user can pile onto
  // one dispute, independent of the per-request MAX_FILES_PER_SUBMISSION.
  async countByChallengeAndUser(challengeId: string, userId: string): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(disputeEvidence)
      .where(
        and(
          eq(disputeEvidence.challengeId, challengeId),
          eq(disputeEvidence.submittedBy, userId),
        ),
      );
    return Number(row?.value ?? 0);
  }

  // Admin dashboard feed — every currently DISPUTED challenge, with both
  // participants and how much evidence has come in for each, so an admin
  // can triage which disputes actually have something to review yet.
  async listDisputedForAdmin(opts: { limit: number; offset: number }) {
    const condition = eq(challenges.status, "DISPUTED");

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: challenges.id,
          title: challenges.title,
          stakeKobo: challenges.stakeKobo,
          potKobo: challenges.potKobo,
          creatorId: challenges.creatorId,
          opponentId: challenges.opponentId,
          creatorName: users.displayName,
          opponentName: opponents.displayName,
          declaredWinnerId: challenges.declaredWinnerId,
          opponentDeclaredWinnerId: challenges.opponentDeclaredWinnerId,
          updatedAt: challenges.updatedAt,
        })
        .from(challenges)
        .leftJoin(users, eq(challenges.creatorId, users.id))
        .leftJoin(opponents, eq(challenges.opponentId, opponents.id))
        .where(condition)
        .orderBy(desc(challenges.updatedAt))
        .limit(opts.limit)
        .offset(opts.offset),
      db.select({ value: count() }).from(challenges).where(condition),
    ]);

    const evidenceCounts = await Promise.all(
      rows.map((r) =>
        db
          .select({ value: count() })
          .from(disputeEvidence)
          .where(eq(disputeEvidence.challengeId, r.id))
          .then(([row]) => Number(row?.value ?? 0)),
      ),
    );

    return {
      challenges: rows.map((r, i) => ({
        id: r.id,
        title: r.title,
        stakeKobo: Number(r.stakeKobo),
        potKobo: Number(r.potKobo),
        creator: { id: r.creatorId, name: r.creatorName ?? "Player", claimedWinnerId: r.declaredWinnerId },
        opponent: r.opponentId
          ? { id: r.opponentId, name: r.opponentName ?? "Player", claimedWinnerId: r.opponentDeclaredWinnerId }
          : null,
        evidenceCount: evidenceCounts[i] ?? 0,
        updatedAt: r.updatedAt.toISOString(),
      })),
      total: Number(countResult[0]?.value ?? 0),
    };
  }
}

export const disputeEvidenceRepository = new DisputeEvidenceRepository();
