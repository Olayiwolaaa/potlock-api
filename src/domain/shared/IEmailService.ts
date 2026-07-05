export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export interface IEmailService {
  send(payload: EmailPayload): Promise<void>;
}