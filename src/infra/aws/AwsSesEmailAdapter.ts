import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';

import type { EmailPort } from '../../core/ports/EmailPort';
import { loadEnv } from '../../config/env';
import { logger } from '../../shared/utils/logger';
import { UpstreamError, ValidationError } from '../../shared/errors/domain';

function toBase64Lines(buffer: Buffer, lineLength = 76): string {
  const b64 = buffer.toString('base64');
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += lineLength) {
    lines.push(b64.slice(i, i + lineLength));
  }
  return lines.join('\r\n');
}

/**
 * AWS SES 기반 이메일 발송 어댑터.
 * - 첨부파일은 MIME multipart/mixed + base64 encoding으로 전달합니다.
 */
export class AwsSesEmailAdapter implements EmailPort {
  private readonly client: SESClient;
  private readonly fromEmail?: string;

  constructor() {
    const env = loadEnv();
    this.fromEmail = env.CHAT_EXPORT_EMAIL_FROM;

    this.client = new SESClient({
      region: env.AWS_REGION,
      endpoint: env.AWS_ENDPOINT_URL,
      credentials:
        env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: env.AWS_ACCESS_KEY_ID,
              secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }

  async sendEmailWithAttachment(input: {
    to: string;
    subject: string;
    text: string;
    attachmentFilename: string;
    attachmentContentType: string;
    attachmentBuffer: Buffer;
  }): Promise<void> {
    if (!this.fromEmail) {
      // env 미설정 시 기능 비활성화 (운영에서만 켜도 됨)
      logger.warn(
        { to: input.to },
        'CHAT_EXPORT_EMAIL_FROM is not set — skip sending export email'
      );
      return;
    }
    if (!input.to?.trim()) throw new ValidationError('Email "to" is required');

    const boundary = `graphnode-export-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const safeSubject = input.subject.replace(/(\r|\n)/g, ' ').trim();

    const raw = [
      `From: ${this.fromEmail}`,
      `To: ${input.to}`,
      `Subject: ${safeSubject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="utf-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      input.text,
      '',
      `--${boundary}`,
      `Content-Type: ${input.attachmentContentType}; name="${input.attachmentFilename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${input.attachmentFilename}"`,
      '',
      toBase64Lines(input.attachmentBuffer),
      '',
      `--${boundary}--`,
      '',
    ].join('\r\n');

    try {
      await this.client.send(
        new SendRawEmailCommand({
          RawMessage: { Data: Buffer.from(raw, 'utf-8') },
        })
      );
    } catch (err: unknown) {
      logger.error({ err, to: input.to }, 'Failed to send SES raw email');
      throw new UpstreamError('Failed to send email', { originalError: err as any });
    }
  }
}

