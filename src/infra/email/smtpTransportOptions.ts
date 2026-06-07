import type SMTPTransport from 'nodemailer/lib/smtp-transport';

/**
 * @description nodemailer SMTP transport 옵션을 구성합니다.
 * Gmail 등에서 흔한 587+secure:true 오설정을 자동 보정합니다.
 */
export function buildSmtpTransportOptions(input: {
  host: string;
  port: number;
  secure?: boolean;
  user: string;
  pass: string;
}): SMTPTransport.Options {
  let { port } = input;
  let secure = input.secure ?? false;

  // 587 = STARTTLS → secure must be false. 465 = implicit TLS → secure must be true.
  if (port === 587 && secure) {
    secure = false;
  }
  if (port === 465 && !secure) {
    secure = true;
  }

  return {
    host: input.host,
    port,
    secure,
    requireTLS: port === 587,
    auth: { user: input.user, pass: input.pass },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    tls: {
      minVersion: 'TLSv1.2',
    },
  };
}

/**
 * @description `CHAT_EXPORT_SMTP_SECURE` 환경변수 문자열을 boolean으로 파싱합니다.
 */
export function parseSmtpSecureEnv(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === 'true';
}

/**
 * @description Infisical/.env에서 복사한 SMTP 비밀번호의 따옴표·공백을 제거합니다.
 * Gmail 앱 비밀번호는 `abcd efgh ijkl mnop` 형태로 붙여넣는 경우가 많습니다.
 */
export function sanitizeSmtpPassword(pass: string): string {
  return pass.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');
}
