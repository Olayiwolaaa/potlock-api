import { Resend } from "resend";
import { env } from "@config/env";
import type { IEmailService, EmailPayload } from "@domain/shared/IEmailService";
import { logger } from "@infrastructure/logger/logger";

export class ResendEmailService implements IEmailService {
    private client: Resend;

    constructor() {
        this.client = new Resend(env.RESEND_API_KEY);
    }

    async send(payload: EmailPayload): Promise<void> {
        const { error } = await this.client.emails.send({
            from: env.EMAIL_FROM,
            to: payload.to,
            subject: payload.subject,
            html: payload.html,
            ...(payload.replyTo && { replyTo: payload.replyTo }),
        });

        if (error) {
            logger.error({ error, to: payload.to }, "Failed to send email via Resend");
            throw new Error(`Email send failed: ${error.message}`);
        }
    }
}