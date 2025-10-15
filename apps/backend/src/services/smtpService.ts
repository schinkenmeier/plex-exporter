import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export interface MailPayload {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface MailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export interface MailSender {
  sendMail(payload: MailPayload): Promise<MailResult>;
}

export type MailTransporter = Pick<Transporter, 'sendMail'>;

const createTransporter = (config: SmtpConfig): MailTransporter =>
  nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth:
      config.user && config.pass
        ? {
            user: config.user,
            pass: config.pass,
          }
        : undefined,
  });

export class SmtpService implements MailSender {
  private readonly transporter: MailTransporter;

  constructor(private readonly config: SmtpConfig, transporter?: MailTransporter) {
    this.transporter = transporter ?? createTransporter(config);
  }

  async sendMail(payload: MailPayload): Promise<MailResult> {
    if (!payload.text && !payload.html) {
      throw new Error('Either text or html content must be provided.');
    }

    const message: SendMailOptions = {
      from: this.config.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    };

    const result = await this.transporter.sendMail(message);

    return {
      messageId: result.messageId ?? '',
      accepted: Array.isArray(result.accepted)
        ? result.accepted.map(String)
        : typeof result.accepted === 'string'
          ? [result.accepted]
          : [],
      rejected: Array.isArray(result.rejected)
        ? result.rejected.map(String)
        : typeof result.rejected === 'string'
          ? [result.rejected]
          : [],
    };
  }
}

export const createSmtpService = (config: SmtpConfig, transporter?: MailTransporter) =>
  new SmtpService(config, transporter);

export default SmtpService;
