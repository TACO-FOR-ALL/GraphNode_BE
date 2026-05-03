import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const sendMailMock = jest.fn<any>().mockResolvedValue({ messageId: 'mock-message-id' });
const createTransportMock = jest.fn<any>().mockReturnValue({ sendMail: sendMailMock });

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: createTransportMock,
  },
}));

jest.mock('../../src/config/env', () => ({
  loadEnv: jest.fn(),
}));

import { loadEnv } from '../../src/config/env';
import { SmtpEmailAdapter } from '../../src/infra/email/SmtpEmailAdapter';
import { ValidationError } from '../../src/shared/errors/domain';

describe('SmtpEmailAdapter', () => {
  const baseEnv = {
    CHAT_EXPORT_SMTP_USER: 'sender@example.com',
    CHAT_EXPORT_SMTP_PASS: 'secret',
    CHAT_EXPORT_EMAIL_FROM: 'noreply@example.com',
    CHAT_EXPORT_SMTP_HOST: 'smtp.example.com',
    CHAT_EXPORT_SMTP_PORT: 587,
    CHAT_EXPORT_SMTP_SECURE: false,
  };

  beforeEach(() => {
    jest.mocked(loadEnv).mockReturnValue(baseEnv as any);
    sendMailMock.mockClear();
    createTransportMock.mockClear();
  });

  it('calls nodemailer sendMail with attachment when SMTP user and pass are set', async () => {
    const adapter = new SmtpEmailAdapter();
    const buf = Buffer.from('{"x":1}', 'utf-8');

    await adapter.sendEmailWithAttachment({
      to: 'recipient@example.com',
      subject: 'Export ready',
      text: 'See attachment.',
      attachmentFilename: 'conv.json',
      attachmentContentType: 'application/json; charset=utf-8',
      attachmentBuffer: buf,
    });

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 587,
        auth: { user: 'sender@example.com', pass: 'secret' },
      })
    );
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@example.com',
        to: 'recipient@example.com',
        subject: 'Export ready',
        attachments: [
          expect.objectContaining({
            filename: 'conv.json',
            contentType: 'application/json; charset=utf-8',
            content: buf,
          }),
        ],
      })
    );
  });

  it('uses SMTP user as From when CHAT_EXPORT_EMAIL_FROM is unset', async () => {
    jest.mocked(loadEnv).mockReturnValue({
      ...baseEnv,
      CHAT_EXPORT_EMAIL_FROM: undefined,
    } as any);

    const adapter = new SmtpEmailAdapter();
    await adapter.sendEmailWithAttachment({
      to: 'r@example.com',
      subject: 'S',
      text: 'T',
      attachmentFilename: 'a.json',
      attachmentContentType: 'application/json',
      attachmentBuffer: Buffer.from('{}'),
    });

    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ from: 'sender@example.com' }));
  });

  it('does not send when SMTP credentials are missing', async () => {
    jest.mocked(loadEnv).mockReturnValue({
      ...baseEnv,
      CHAT_EXPORT_SMTP_USER: '',
      CHAT_EXPORT_SMTP_PASS: '',
    } as any);

    const adapter = new SmtpEmailAdapter();
    await adapter.sendEmailWithAttachment({
      to: 'r@example.com',
      subject: 'S',
      text: 'T',
      attachmentFilename: 'a.json',
      attachmentContentType: 'application/json',
      attachmentBuffer: Buffer.from('{}'),
    });

    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('throws ValidationError when "to" is empty', async () => {
    const adapter = new SmtpEmailAdapter();

    await expect(
      adapter.sendEmailWithAttachment({
        to: '   ',
        subject: 'S',
        text: 'T',
        attachmentFilename: 'a.json',
        attachmentContentType: 'application/json',
        attachmentBuffer: Buffer.from('{}'),
      })
    ).rejects.toThrow(ValidationError);
  });
});
