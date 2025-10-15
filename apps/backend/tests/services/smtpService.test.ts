import { describe, expect, it } from 'vitest';

import {
  SmtpService,
  type MailResult,
  type SmtpConfig,
  type MailTransporter,
} from '../../src/services/smtpService.js';

class TransporterStub implements MailTransporter {
  public readonly invocations: unknown[] = [];

  constructor(private readonly response: Partial<MailResult> & { accepted?: unknown; rejected?: unknown }) {}

  async sendMail(options: unknown) {
    this.invocations.push(options);

    return {
      messageId: this.response.messageId ?? 'id-123',
      accepted: this.response.accepted ?? ['recipient@example.com'],
      rejected: this.response.rejected ?? [],
    };
  }
}

describe('SmtpService', () => {
  const config: SmtpConfig = {
    host: 'smtp.example.com',
    port: 1025,
    secure: false,
    from: 'plex@example.com',
  };

  it('forwards messages to the underlying transporter', async () => {
    const transporter = new TransporterStub({ messageId: 'abc', accepted: ['ok@example.com'] });
    const service = new SmtpService(config, transporter);

    const result = await service.sendMail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'Hello world',
    });

    expect(result.messageId).toBe('abc');
    expect(result.accepted).toEqual(['ok@example.com']);
    expect(result.rejected).toEqual([]);

    expect(transporter.invocations).toHaveLength(1);
    const invocation = transporter.invocations[0] as { from: string };
    expect(invocation.from).toBe('plex@example.com');
  });

  it('throws when neither text nor html content is provided', async () => {
    const transporter = new TransporterStub({});
    const service = new SmtpService(config, transporter);

    await expect(service.sendMail({ to: 'user@example.com', subject: 'Test' })).rejects.toThrow(
      'Either text or html content must be provided.',
    );
  });
});
