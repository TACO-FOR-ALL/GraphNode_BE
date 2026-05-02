import nodemailer from 'nodemailer';

import type { EmailPort } from '../../core/ports/EmailPort';
import { loadEnv } from '../../config/env';
import { logger } from '../../shared/utils/logger';
import { UpstreamError, ValidationError } from '../../shared/errors/domain';

/**
 * SMTP(nodemailer) 기반 메일 발송 어댑터 — Gmail 등 직접 SMTP 계정으로 첨부 메일을 보냅니다.
 * AWS SES를 사용하지 않습니다.
 */
export class SmtpEmailAdapter implements EmailPort {
  /**
   * @description 첨부파일이 있는 메일을 SMTP로 발송합니다.
   * @throws {ValidationError} 수신 주소가 비었을 때
   * @throws {UpstreamError} SMTP 전송 실패 시
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
    const user = env.CHAT_EXPORT_SMTP_USER?.trim();
    const pass = env.CHAT_EXPORT_SMTP_PASS?.trim();

    if (!user || !pass) {
      logger.warn(
        { to: input.to },
        'CHAT_EXPORT_SMTP_USER / CHAT_EXPORT_SMTP_PASS not set — skip sending export email'
      );
      return;
    }

    const from = (env.CHAT_EXPORT_EMAIL_FROM?.trim() || user) as string;
    if (!input.to?.trim()) throw new ValidationError('Email "to" is required');

    const secure = env.CHAT_EXPORT_SMTP_SECURE ?? false;

    const transporter = nodemailer.createTransport({
      host: env.CHAT_EXPORT_SMTP_HOST,
      port: env.CHAT_EXPORT_SMTP_PORT,
      secure,
      requireTLS: !secure,
      auth: { user, pass },
    });

    try {
      await transporter.sendMail({
        from,
        to: input.to.trim(),
        subject: input.subject.replace(/(\r|\n)/g, ' ').trim(),
        text: input.text,
        attachments: [
          {
            filename: input.attachmentFilename,
            contentType: input.attachmentContentType,
            content: input.attachmentBuffer,
          },
        ],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // 비밀번호·auth 응답은 로그에 남기지 않음 — 수신 주소만 상위 문맥용
      logger.error({ to: input.to, smtpErrorMessage: message }, 'Failed to send SMTP email');
      throw new UpstreamError('Failed to send email', { cause: err as Error });
    }
  }
}
