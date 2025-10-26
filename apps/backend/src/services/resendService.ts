import { Resend } from 'resend';

export interface ResendConfig {
  apiKey: string;
  fromEmail: string;
}

export interface MailPayload {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
}

export interface MailResult {
  id: string;
  from?: string;
  to?: string[];
  created_at?: string;
}

export interface MailSender {
  sendMail(payload: MailPayload): Promise<MailResult>;
}

export class ResendService implements MailSender {
  private readonly client: Resend;
  private readonly fromEmail: string;

  constructor(private readonly config: ResendConfig) {
    this.client = new Resend(config.apiKey);
    this.fromEmail = config.fromEmail;
  }

  async sendMail(payload: MailPayload): Promise<MailResult> {
    if (!payload.text && !payload.html) {
      throw new Error('Either text or html content must be provided.');
    }

    try {
      const emailOptions: any = {
        from: this.fromEmail,
        to: Array.isArray(payload.to) ? payload.to : [payload.to],
        subject: payload.subject,
      };

      if (payload.html) {
        emailOptions.html = payload.html;
      }

      if (payload.text) {
        emailOptions.text = payload.text;
      }

      if (payload.replyTo) {
        emailOptions.replyTo = payload.replyTo;
      }

      if (payload.cc) {
        emailOptions.cc = Array.isArray(payload.cc) ? payload.cc : [payload.cc];
      }

      if (payload.bcc) {
        emailOptions.bcc = Array.isArray(payload.bcc) ? payload.bcc : [payload.bcc];
      }

      const { data, error } = await this.client.emails.send(emailOptions);

      if (error) {
        throw new Error(`Resend API error: ${error.message}`);
      }

      if (!data) {
        throw new Error('No data returned from Resend API');
      }

      return {
        id: data.id,
        from: this.fromEmail,
        to: Array.isArray(payload.to) ? payload.to : [payload.to],
        created_at: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to send email via Resend: ${error.message}`);
      }
      throw new Error('Failed to send email via Resend: Unknown error');
    }
  }

  /**
   * Verify that the Resend API key is valid
   */
  async verifyConnection(): Promise<boolean> {
    try {
      // Send a test request to verify the API key
      const { error } = await this.client.emails.send({
        from: this.fromEmail,
        to: ['test@resend.dev'], // Resend's test email
        subject: 'Connection Test',
        text: 'Testing Resend connection',
      });

      return !error;
    } catch {
      return false;
    }
  }
}

export const createResendService = (config: ResendConfig) => new ResendService(config);

export default ResendService;
