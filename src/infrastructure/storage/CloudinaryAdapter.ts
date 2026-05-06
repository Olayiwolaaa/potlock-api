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
  | "potlockng/games";

export interface UploadResult {
  url: string;           // HTTPS delivery URL
  publicId: string;      // for future deletion/transformation
  width: number;
  height: number;
  format: string;
  bytes: number;
}

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

  // Delete an image by its public ID
  async delete(publicId: string): Promise<boolean> {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
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
}

export const cloudinaryAdapter = new CloudinaryAdapter();