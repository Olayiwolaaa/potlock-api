import { IChallengeRepository } from "@domain/challenge/IChallengeRepository";
import { Result, ok, err } from "@domain/shared/Result";
import { CloudinaryAdapter, DISPUTE_MEDIA_LIMITS } from "@infrastructure/storage/CloudinaryAdapter";
import { DisputeEvidenceRepository } from "@infrastructure/db/repositories/DisputeEvidenceRepository";
import { db } from "@infrastructure/db/client";
import { users } from "@infrastructure/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "@infrastructure/logger/logger";
import { notificationService } from "@infrastructure/realtime/NotificationService";
import { Events } from "@infrastructure/realtime/PusherAdapter";

interface EvidenceFile {
  buffer: Buffer;
  mimeType: string;
}

interface SubmitDisputeEvidenceInput {
  challengeId: string;
  userId: string;
  files: EvidenceFile[];
  note?: string;
}

interface UploadedEvidence {
  id: string;
  mediaType: "IMAGE" | "VIDEO";
  mediaUrl: string;
}

interface SubmitDisputeEvidenceOutput {
  uploaded: UploadedEvidence[];
}

// Total evidence a single user may have attached to one dispute across
// however many requests they make — a per-request cap alone (see
// DISPUTE_MEDIA_LIMITS.MAX_FILES_PER_SUBMISSION) wouldn't stop someone
// from just calling the endpoint repeatedly.
const MAX_TOTAL_PER_USER = 10;

export class SubmitDisputeEvidenceUseCase {
  constructor(
    private readonly challengeRepo: IChallengeRepository,
    private readonly storage: CloudinaryAdapter,
    private readonly evidenceRepo: DisputeEvidenceRepository,
  ) {}

  async execute(input: SubmitDisputeEvidenceInput): Promise<Result<SubmitDisputeEvidenceOutput>> {
    if (input.files.length === 0) {
      return err("Attach at least one screenshot or video");
    }
    if (input.files.length > DISPUTE_MEDIA_LIMITS.MAX_FILES_PER_SUBMISSION) {
      return err(`You can attach up to ${DISPUTE_MEDIA_LIMITS.MAX_FILES_PER_SUBMISSION} files at a time`);
    }

    const challenge = await this.challengeRepo.findById(input.challengeId);
    if (!challenge) return err("Challenge not found");

    if (!challenge.isParticipant(input.userId)) {
      return err("You are not a participant in this challenge");
    }

    if (challenge.status !== "DISPUTED") {
      return err("Evidence can only be submitted once a challenge is under dispute");
    }

    const existingCount = await this.evidenceRepo.countByChallengeAndUser(
      input.challengeId,
      input.userId,
    );
    if (existingCount + input.files.length > MAX_TOTAL_PER_USER) {
      return err(`You've reached the limit of ${MAX_TOTAL_PER_USER} files for this dispute`);
    }

    // Validate every file up front — fail fast before uploading any of
    // them, rather than partially uploading and then erroring out.
    const validations = input.files.map((f) =>
      CloudinaryAdapter.validateDisputeMedia(f.buffer, f.mimeType),
    );
    const firstInvalid = validations.find((v) => !v.valid);
    if (firstInvalid) return err(firstInvalid.error!);

    const uploaded: UploadedEvidence[] = [];

    for (const [i, file] of input.files.entries()) {
      const validation = validations[i]!;
      const mediaType = validation.mediaType!;

      const result = await this.storage.uploadMedia(file.buffer, mediaType, "potlockng/disputes", {
        publicId: `dispute_${input.challengeId}_${input.userId}_${randomUUID()}`,
      });

      if (!result) {
        logger.error(
          { challengeId: input.challengeId, userId: input.userId, fileIndex: i },
          "Dispute evidence upload failed",
        );
        // Best-effort: keep whatever uploaded successfully so far rather
        // than losing it, but stop processing and surface the failure.
        if (uploaded.length === 0) return err("Upload failed. Please try again.");
        break;
      }

      const row = await this.evidenceRepo.create({
        challengeId: input.challengeId,
        submittedBy: input.userId,
        mediaType,
        mediaUrl: result.url,
        mediaPublicId: result.publicId,
        fileSizeBytes: file.buffer.length,
        note: input.note?.trim() || undefined,
      });
      if (!row) {
        logger.error(
          { challengeId: input.challengeId, userId: input.userId, fileIndex: i },
          "Dispute evidence upload succeeded but the DB record failed to save",
        );
        continue;
      }

      uploaded.push({ id: row.id, mediaType, mediaUrl: result.url });
    }

    // Let admins know there's fresh evidence to look at. Best-effort —
    // never let a notification failure mask a successful upload.
    try {
      const admins = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"));

      if (admins.length > 0) {
        await notificationService.notifyMany(
          admins.map((a) => a.id),
          Events.CHALLENGE_DISPUTE_EVIDENCE_SUBMITTED,
          () => "New dispute evidence",
          () => `Evidence submitted for "${challenge.title}" — ${uploaded.length} file(s).`,
        );
      }
    } catch (error) {
      logger.error({ error, challengeId: challenge.id }, "Failed to notify admins of dispute evidence");
    }

    return ok({ uploaded });
  }
}
