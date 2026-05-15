import { describe, expect, it } from '@jest/globals';

import {
  buildSmtpTransportOptions,
  sanitizeSmtpPassword,
} from '../../src/infra/email/smtpTransportOptions';

describe('buildSmtpTransportOptions', () => {
  it('forces secure=false when port is 587 and secure was true (Gmail STARTTLS)', () => {
    const opts = buildSmtpTransportOptions({
      host: 'smtp.gmail.com',
      port: 587,
      secure: true,
      user: 'u@gmail.com',
      pass: 'secret',
    });
    expect(opts.secure).toBe(false);
    expect(opts.requireTLS).toBe(true);
  });

  it('strips quotes and spaces from Gmail app password paste', () => {
    expect(sanitizeSmtpPassword('"abcd efgh ijkl mnop"')).toBe('abcdefghijklmnop');
  });

  it('forces secure=true when port is 465', () => {
    const opts = buildSmtpTransportOptions({
      host: 'smtp.gmail.com',
      port: 465,
      secure: false,
      user: 'u@gmail.com',
      pass: 'secret',
    });
    expect(opts.secure).toBe(true);
  });
});
