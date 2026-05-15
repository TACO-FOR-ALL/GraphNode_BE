/**
 * 채팅보내기 SMTP 설정만 검증하는 로컬 스크립트.
 *
 * Usage:
 *   infisical run -- npx tsx tests/scripts/smtp-export-ping.ts [recipient@email.com]
 *   infisical run -- npx tsx tests/scripts/smtp-export-ping.ts --debug yuc010100@naver.com
 */
import { config as loadDotenv } from 'dotenv';

loadDotenv({ override: false });

import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

import {
  buildSmtpTransportOptions,
  parseSmtpSecureEnv,
  sanitizeSmtpPassword,
} from '../../src/infra/email/smtpTransportOptions';

const args = process.argv.slice(2);
const debug = args.includes('--debug');
const to = (args.find((a) => a !== '--debug') ?? process.env.CHAT_EXPORT_TEST_TO ?? '').trim();
const host = process.env.CHAT_EXPORT_SMTP_HOST ?? 'smtp.gmail.com';
const envPort = Number(process.env.CHAT_EXPORT_SMTP_PORT ?? 587);
const secureRaw = process.env.CHAT_EXPORT_SMTP_SECURE;

if (!to) {
  console.error(
    'Usage: npx tsx tests/scripts/smtp-export-ping.ts [--debug] <recipient@email.com>'
  );
  process.exit(1);
}

function requireSmtpCredentials(): { user: string; pass: string; from: string } {
  const user = process.env.CHAT_EXPORT_SMTP_USER?.trim();
  const rawPass = process.env.CHAT_EXPORT_SMTP_PASS?.trim();
  if (!user || !rawPass) {
    console.error('Missing CHAT_EXPORT_SMTP_USER or CHAT_EXPORT_SMTP_PASS in environment.');
    process.exit(1);
  }
  const pass = sanitizeSmtpPassword(rawPass);
  const from = process.env.CHAT_EXPORT_EMAIL_FROM?.trim() || user;
  return { user, pass, from };
}

function maskEmail(email: string): string {
  return email.replace(/(.{2}).+(@.+)/, '$1***$2');
}

async function trySmtpAttempt(input: {
  label: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}): Promise<{ messageId: string }> {
  const transportOpts: SMTPTransport.Options = {
    ...buildSmtpTransportOptions({
      host: input.host,
      port: input.port,
      secure: input.secure,
      user: input.user,
      pass: input.pass,
    }),
    logger: debug,
    debug,
  };

  console.log(
    JSON.stringify(
      {
        step: 'attempt',
        label: input.label,
        host: transportOpts.host,
        port: transportOpts.port,
        secure: transportOpts.secure,
        requireTLS: transportOpts.requireTLS,
      },
      null,
      2
    )
  );

  const transporter = nodemailer.createTransport(transportOpts);
  await transporter.verify();

  const info = await transporter.sendMail({
    from: input.from,
    to,
    subject: '[GraphNode] Chat export SMTP test',
    text: [
      'SMTP ping from tests/scripts/smtp-export-ping.ts',
      '',
      `Attempt: ${input.label}`,
      'If you received this, CHAT_EXPORT_SMTP_* is working.',
    ].join('\n'),
    attachments: [
      {
        filename: 'smtp-ping.txt',
        content: `GraphNode export SMTP OK (${input.label})\n`,
      },
    ],
  });

  return { messageId: String(info.messageId) };
}

async function main() {
  const { user, pass, from } = requireSmtpCredentials();

  console.log(
    JSON.stringify(
      {
        step: 'config',
        host,
        envPort,
        secureEnvRaw: secureRaw ?? '(unset)',
        user: maskEmail(user),
        from: maskEmail(from),
        to,
        passLength: pass.length,
        passLooksLikeGmailAppPassword: pass.length === 16,
      },
      null,
      2
    )
  );

  if (pass.length !== 16) {
    console.warn(
      JSON.stringify({
        warning:
          'Gmail app passwords are usually 16 characters (spaces removed). Regenerate at https://myaccount.google.com/apppasswords',
      })
    );
  }

  const attempts: Array<{ label: string; port: number; secure: boolean }> = [
    {
      label: 'env',
      port: envPort,
      secure: parseSmtpSecureEnv(secureRaw),
    },
    ...(envPort !== 587 ? [{ label: 'gmail-587-starttls', port: 587, secure: false }] : []),
    ...(envPort !== 465 ? [{ label: 'gmail-465-ssl', port: 465, secure: true }] : []),
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const result = await trySmtpAttempt({
        label: attempt.label,
        host,
        port: attempt.port,
        secure: attempt.secure,
        user,
        pass,
        from,
      });
      console.log(
        JSON.stringify(
          { ok: true, messageId: result.messageId, to, from, winningAttempt: attempt.label },
          null,
          2
        )
      );
      return;
    } catch (err: unknown) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(JSON.stringify({ step: 'attempt_failed', label: attempt.label, error: message }));
    }
  }

  throw lastError;
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  const extra =
    err && typeof err === 'object'
      ? {
          code: 'code' in err ? (err as { code?: string }).code : undefined,
          responseCode:
            'responseCode' in err ? (err as { responseCode?: number }).responseCode : undefined,
          command: 'command' in err ? (err as { command?: string }).command : undefined,
          response: 'response' in err ? (err as { response?: string }).response : undefined,
        }
      : {};
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: message,
        ...extra,
        fixes: [
          'Regenerate Gmail App Password (16 chars, no spaces) → update CHAT_EXPORT_SMTP_PASS in Infisical.',
          'CHAT_EXPORT_SMTP_USER must be the same Gmail account as the app password.',
          'Retry with: infisical run -- npx tsx tests/scripts/smtp-export-ping.ts --debug yuc010100@naver.com',
          'If 587 and 465 both fail: check Google account 2FA, or Workspace admin SMTP restriction.',
        ],
      },
      null,
      2
    )
  );
  process.exit(1);
});
