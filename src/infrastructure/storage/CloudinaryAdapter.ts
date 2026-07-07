import { v2 as cloudinary } from "cloudinary";
import { env } from "@config/env";
import { logger } from "@infrastructure/logger/logger";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export type UploadFolder =
  | "potlockng/profiles"
  | "potlockng/challenges"
  | "potlockng/games"
  | "potlockng/disputes";

export type MediaType = "IMAGE" | "VIDEO";

export interface UploadResult {
  url: string;           // HTTPS delivery URL
  publicId: string;      // for future deletion/transformation
  width: number;
  height: number;
  format: string;
  bytes: number;
}

// Kept separate from the profile/game image limits below — dispute clips
// are naturally heavier than a profile picture, so they get their own,
// more generous ceiling instead of inheriting the 5MB image cap.
export const DISPUTE_MEDIA_LIMITS = {
  ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/webp"] as const,
  ALLOWED_VIDEO_TYPES: [
    "video/mp4",
    "video/quicktime", // .mov
    "video/webm",
  ] as const,
  MAX_IMAGE_BYTES: 8 * 1024 * 1024, // 8MB
  MAX_VIDEO_BYTES: 50 * 1024 * 1024, // 50MB
  MAX_FILES_PER_SUBMISSION: 5,
};

export class CloudinaryAdapter {
  // Upload from a Buffer (file bytes from multipart form)
  async uploadBuffer(
    buffer: Buffer,
    folder: UploadFolder,
    options: {
      publicId?: string;     // override the random ID
      maxWidth?: number;     // auto-resize if wider
      maxHeight?: number;
    } = {},
  ): Promise<UploadResult | null> {
    try {
      const result = await new Promise<UploadResult>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            public_id: options.publicId,
            overwrite: true,
            resource_type: "image",
            transformation: [
              {
                width: options.maxWidth ?? 1200,
                height: options.maxHeight ?? 1200,
                crop: "limit",   // never upscale, only downscale
                quality: "auto", // Cloudinary picks best quality/size tradeoff
                fetch_format: "auto", // serve WebP to browsers that support it
              },
            ],
          },
          (error, result) => {
            if (error || !result) return reject(error);
            resolve({
              url: result.secure_url,
              publicId: result.public_id,
              width: result.width,
              height: result.height,
              format: result.format,
              bytes: result.bytes,
            });
          },
        );
        stream.end(buffer);
      });

      logger.info(
        { publicId: result.publicId, bytes: result.bytes },
        "Image uploaded to Cloudinary",
      );
      return result;
    } catch (error) {
      logger.error({ error, folder }, "Cloudinary upload failed");
      return null;
    }
  }

  // Upload dispute evidence (image OR video) from a Buffer. Unlike
  // uploadBuffer above (which is hardcoded to resource_type: "image"),
  // this picks the right resource type and applies size-optimizing
  // transformations for whichever kind of file comes in:
  //   - images: same downscale-only + auto quality/format as profile photos
  //   - videos: capped resolution + auto quality/codec, so a phone-shot
  //     clip doesn't get stored (and re-served) at its original bitrate
  async uploadMedia(
    buffer: Buffer,
    mediaType: MediaType,
    folder: UploadFolder,
    options: { publicId?: string } = {},
  ): Promise<UploadResult | null> {
    const isVideo = mediaType === "VIDEO";

    try {
      const result = await new Promise<UploadResult>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            public_id: options.publicId,
            overwrite: true,
            resource_type: isVideo ? "video" : "image",
            // Cloudinary applies these on upload for images; for videos it
            // queues them as an eager transformation so the compressed
            // version is ready shortly after upload without blocking the
            // request on full transcoding.
            eager: isVideo
              ? [
                  {
                    width: 1280,
                    height: 1280,
                    crop: "limit", // never upscale, only downscale
                    quality: "auto",
                    video_codec: "auto", // let Cloudinary pick an efficient codec
                    fetch_format: "auto",
                  },
                ]
              : undefined,
            eager_async: isVideo,
            transformation: isVideo
              ? undefined
              : [
                  {
                    width: 1600,
                    height: 1600,
                    crop: "limit",
                    quality: "auto",
                    fetch_format: "auto",
                  },
                ],
          },
          (error, result) => {
            if (error || !result) return reject(error);
            resolve({
              url: result.secure_url,
              publicId: result.public_id,
              width: result.width ?? 0,
              height: result.height ?? 0,
              format: result.format,
              bytes: result.bytes,
            });
          },
        );
        stream.end(buffer);
      });

      logger.info(
        { publicId: result.publicId, bytes: result.bytes, mediaType },
        "Dispute evidence uploaded to Cloudinary",
      );
      return result;
    } catch (error) {
      logger.error({ error, folder, mediaType }, "Cloudinary media upload failed");
      return null;
    }
  }

  // Delete an asset by its public ID. Pass resourceType for non-image
  // assets (e.g. dispute videos) — Cloudinary defaults to "image" and
  // will silently no-op (not found) if you omit it for a video.
  async delete(publicId: string, resourceType: "image" | "video" = "image"): Promise<boolean> {
    try {
      const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
      return result.result === "ok";
    } catch (error) {
      logger.error({ error, publicId }, "Cloudinary delete failed");
      return false;
    }
  }

  // Validate file before uploading
  static validateImage(
    buffer: Buffer,
    mimeType: string,
  ): { valid: boolean; error?: string } {
    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
    const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

    if (!ALLOWED_TYPES.includes(mimeType)) {
      return { valid: false, error: "Only JPEG, PNG and WebP images are allowed" };
    }

    if (buffer.length > MAX_SIZE_BYTES) {
      return { valid: false, error: "Image must be under 5MB" };
    }

    return { valid: true };
  }

  // Validate a dispute evidence file and tell the caller which media type
  // it is, so the upload step knows whether to treat it as image or video.
  static validateDisputeMedia(
    buffer: Buffer,
    mimeType: string,
  ): { valid: boolean; error?: string; mediaType?: MediaType } {
    const isImage = (DISPUTE_MEDIA_LIMITS.ALLOWED_IMAGE_TYPES as readonly string[]).includes(mimeType);
    const isVideo = (DISPUTE_MEDIA_LIMITS.ALLOWED_VIDEO_TYPES as readonly string[]).includes(mimeType);

    if (!isImage && !isVideo) {
      return {
        valid: false,
        error: "Only JPEG, PNG, WebP images or MP4, MOV, WebM videos are allowed",
      };
    }

    const maxBytes = isVideo
      ? DISPUTE_MEDIA_LIMITS.MAX_VIDEO_BYTES
      : DISPUTE_MEDIA_LIMITS.MAX_IMAGE_BYTES;

    if (buffer.length > maxBytes) {
      return {
        valid: false,
        error: isVideo
          ? `Video must be under ${maxBytes / (1024 * 1024)}MB`
          : `Image must be under ${maxBytes / (1024 * 1024)}MB`,
      };
    }

    return { valid: true, mediaType: isVideo ? "VIDEO" : "IMAGE" };
  }
}

export const cloudinaryAdapter = new CloudinaryAdapter();