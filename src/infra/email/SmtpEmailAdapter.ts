import nodemailer from 'nodemailer';

import type { EmailPort } from '../../core/ports/EmailPort';
import { loadEnv } from '../../config/env';
import { logger } from '../../shared/utils/logger';
import { UpstreamError, ValidationError } from '../../shared/errors/domain';
import { buildSmtpTransportOptions, sanitizeSmtpPassword } from './smtpTransportOptions';

/**
 * nodemailer(SMTP)로 메일을 직접 발송하는 어댑터.
 * AWS SES API를 거치지 않고, `CHAT_EXPORT_SMTP_USER` / `CHAT_EXPORT_SMTP_PASS`로 SMTP에 연결합니다.
 */
export class SmtpEmailAdapter implements EmailPort {
  /**
   * @description plain text 메일을 SMTP로 발송합니다.
   */
  async sendEmail(input: { to: string; subject: string; text: string }): Promise<void> {
    await this.sendMailInternal({
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
  }

  /**
   * @description 첨부파일이 있는 메일을 SMTP로 발송합니다.
   * @throws {ValidationError} 첨부가 SMTP 한도를 초과할 때.
   */
  async sendEmailWithAttachment(input: {
    to: string;
    subject: string;
    text: string;
    attachmentFilename: string;
    attachmentContentType: string;
    attachmentBuffer: Buffer;
  }): Promise<void> {
    const env = loadEnv();
    const maxBytes = env.CHAT_EXPORT_SMTP_MAX_ATTACHMENT_BYTES;
    if (input.attachmentBuffer.length > maxBytes) {
      throw new ValidationError(
        `Attachment exceeds SMTP limit (${maxBytes} bytes): ${input.attachmentBuffer.length}`
      );
    }

    await this.sendMailInternal({
      to: input.to,
      subject: input.subject,
      text: input.text,
      attachments: [
        {
          filename: input.attachmentFilename,
          contentType: input.attachmentContentType,
          content: input.attachmentBuffer,
        },
      ],
    });
  }

  private async sendMailInternal(input: {
    to: string;
    subject: string;
    text: string;
    attachments?: Array<{
      filename: string;
      contentType: string;
      content: Buffer;
    }>;
  }): Promise<void> {
    const env = loadEnv();
    const user = env.CHAT_EXPORT_SMTP_USER?.trim();
    const pass = env.CHAT_EXPORT_SMTP_PASS ? sanitizeSmtpPassword(env.CHAT_EXPORT_SMTP_PASS) : '';

    if (!user || !pass) {
      logger.warn({ to: input.to }, 'CHAT_EXPORT_SMTP_USER / CHAT_EXPORT_SMTP_PASS not set — skip email');
      return;
    }

    const from = (env.CHAT_EXPORT_EMAIL_FROM?.trim() || user) as string;
    if (!input.to?.trim()) throw new ValidationError('Email "to" is required');

    const transporter = nodemailer.createTransport(
      buildSmtpTransportOptions({
        host: env.CHAT_EXPORT_SMTP_HOST,
        port: env.CHAT_EXPORT_SMTP_PORT,
        secure: env.CHAT_EXPORT_SMTP_SECURE ?? false,
        user,
        pass,
      })
    );

    try {
      await transporter.sendMail({
        from,
        to: input.to.trim(),
        subject: input.subject.replace(/(\r|\n)/g, ' ').trim(),
        text: input.text,
        attachments: input.attachments,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ to: input.to, smtpErrorMessage: message }, 'Failed to send SMTP email');
      throw new UpstreamError('Failed to send email', { cause: err as Error });
    }
  }
}
