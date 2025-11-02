import { db } from '../db/globalDb.js';
import { welcomeEmails } from '../db/schema.js';
import type { MailSender } from './resendService.js';
import logger from './logger.js';
import { eq, desc, and } from 'drizzle-orm';

export interface WelcomeEmailOptions {
  recipientName?: string;
  toolUrl?: string;
}

class WelcomeEmailService {
  private mailSender: MailSender | null = null;

  /**
   * Set mail sender for email functionality
   */
  setMailSender(sender: MailSender): void {
    this.mailSender = sender;
  }

  /**
   * Send a welcome email to a new user
   */
  async sendWelcomeEmail(
    recipientEmail: string,
    options: WelcomeEmailOptions = {}
  ): Promise<string> {
    if (!this.mailSender) {
      throw new Error('Mail sender not configured. Email functionality is disabled.');
    }

    const { recipientName, toolUrl = 'http://localhost:4001' } = options;

    const html = this.generateWelcomeEmailHTML(recipientName, toolUrl);
    const text = this.generateWelcomeEmailText(recipientName, toolUrl);

    try {
      const result = await this.mailSender.sendMail({
        to: recipientEmail,
        subject: 'Nils Plex-Bibliothek – Einladung',
        html,
        text,
      });

      // Store welcome email record
      await db.insert(welcomeEmails).values({
        email: recipientEmail,
        status: 'sent',
        emailId: result.id,
      });

      logger.info('Welcome email sent', { recipientEmail, emailId: result.id });
      return result.id;
    } catch (error) {
      // Store failed welcome email record
      await db.insert(welcomeEmails).values({
        email: recipientEmail,
        status: 'failed',
      });

      logger.error('Failed to send welcome email', { recipientEmail, error });
      throw error;
    }
  }

  /**
   * Generate the HTML content for the welcome email
   */
  private generateWelcomeEmailHTML(recipientName?: string, toolUrl?: string): string {
    const name = recipientName ? `Hi ${recipientName},` : 'Hi,';
    const url = toolUrl || 'http://localhost:4001';
    const year = new Date().getFullYear();

    return `
  <!doctype html>
  <html lang="de">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Nils Plex-Bibliothek – Einladung</title>
    <style>
      :root {
        color-scheme: light dark;
        --plex-orange: #ffb000;
        --bg-dark: #0e0f12;
        --card-dark: #15171c;
        --text-dark: #e6e6e6;
        --muted-dark: #a9b0bb;
        --border-dark: #20232a;
        --bg-light: #f5f7fa;
        --card-light: #ffffff;
        --text-light: #222;
        --muted-light: #555;
        --border-light: #d9dde4;
      }

      @media (prefers-color-scheme: dark) {
        body {
          background: var(--bg-dark);
          color: var(--text-dark);
        }
        .card {
          background: var(--card-dark);
          color: var(--text-dark);
          border-color: var(--border-dark);
        }
        .muted { color: var(--muted-dark); }
        .kopie-box {
          background: rgba(255,176,0,0.08);
          border: 1px solid var(--plex-orange);
        }
        .note { background:#0f1116;border:1px dashed #2b2f3a; }
        a.button {
          background: var(--plex-orange);
          color: #101216;
          border: 1px solid #e09b00;
        }
      }

      @media (prefers-color-scheme: light) {
        body {
          background: var(--bg-light);
          color: var(--text-light);
        }
        .card {
          background: var(--card-light);
          color: var(--text-light);
          border-color: var(--border-light);
          box-shadow: 0 4px 12px rgba(0,0,0,.1);
        }
        .muted { color: var(--muted-light); }
        .kopie-box {
          background: rgba(255,176,0,0.12);
          border: 1px solid var(--plex-orange);
        }
        .note { background:#fafafa;border:1px dashed #d6d8dc; }
        a.button {
          background: var(--plex-orange);
          color: #222;
          border: 1px solid #e09b00;
        }
      }

      body {
        margin:0;
        padding:0;
        font-family: Arial, Helvetica, sans-serif;
      }
      table { border-collapse: collapse; width:100%; }
      .container { max-width:640px; margin:0 auto; border-radius:14px; overflow:hidden; }
      a.button {
        display:inline-block;
        text-decoration:none;
        font-weight:700;
        padding:13px 22px;
        border-radius:10px;
        font-size:15px;
      }
    </style>
  </head>
  <body>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" class="container card" cellpadding="0" cellspacing="0" style="border:1px solid #20232a;">
            
            <!-- Header -->
            <tr>
              <td style="padding:36px 28px 28px 28px;border-bottom:1px solid #20232a;background:linear-gradient(135deg,#1b1e24 0%,#111317 100%);">
                <h1 style="margin:0;font-size:24px;line-height:1.2;color:#f5f5f5;">Nils Plex-Bibliothek</h1>
                <p class="muted" style="margin:10px 0 0 0;font-size:14px;line-height:1.5;">
                  Deine Einladung zum Stöbern in meinen Filmen & Serien
                </p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:24px 28px 8px 28px;">
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;">${name}</p>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;">
                  hier ist dein Zugang zu <strong>Nils Plex-Bibliothek</strong>. Dort kannst du gemütlich durch meine Mediathek stöbern, Titel auf eine Merkliste setzen und diese anschließend per E-Mail versenden oder als JSON-Datei exportieren.
                </p>

                <!-- Kopie-Hinweis -->
                <div class="kopie-box" style="margin:18px 0 18px 0;padding:16px 18px;border-radius:12px;display:flex;align-items:flex-start;gap:12px;">
                  <div style="font-size:20px;line-height:1;">✉️</div>
                  <div style="font-size:14px;line-height:1.7;">
                    Beim Mail-Export kannst du wählen, ob auch ich eine Kopie deiner Merkliste erhalten soll – 
                    oder ob sie nur an deine eigene Adresse geschickt wird. So weiß ich direkt, was du dir ausgesucht hast.
                  </div>
                </div>

                <div style="margin:18px 0 8px 0;padding:16px;border:1px solid #262a33;border-radius:12px;background:#101216;">
                  <h2 style="margin:0 0 10px 0;font-size:16px;color:#ffb000;">So geht’s in 5 Schritten</h2>
                  <ol style="margin:0;padding-left:18px;font-size:14px;line-height:1.7;">
                    <li>Klicke auf „Jetzt öffnen“.</li>
                    <li>Gib deine E-Mail-Adresse ein.</li>
                    <li>Du bekommst einen einmaligen Anmeldecode per Mail.</li>
                    <li>Code auf der Seite eingeben → Zugang erhalten.</li>
                    <li>Stöbern, Merkliste befüllen und exportieren oder versenden.</li>
                  </ol>
                </div>

                <div style="text-align:center;margin:22px 0 6px 0;">
                  <a href="${url}" class="button">Jetzt öffnen</a>
                </div>

                <div class="note" style="margin:18px 0 0 0;padding:14px;border-radius:10px;">
                  <p style="margin:0;font-size:13px;line-height:1.6;">
                    Hinweis: Es ist kein separates Passwort oder Konto nötig – nur deine E-Mail für den Einmal-Code. 
                    Deine Merkliste kannst du mir direkt per E-Mail schicken oder als JSON mitnehmen. 
                    Wenn du beim Versand die Option „Kopie an Nils“ aktivierst, erhalte ich automatisch deine Auswahl.
                  </p>
                </div>

                <p style="margin:20px 0 8px 0;font-size:14px;">
                  Viel Spaß beim Stöbern!<br>
                  <span style="color:#ffb000;">Nils</span>
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:16px 28px 24px 28px;font-size:12px;border-top:1px solid #20232a;">
                <p class="muted" style="margin:0 0 6px 0;">
                  Diese Einladung wurde automatisch versendet, weil deine Adresse dafür hinterlegt wurde.
                </p>
                <p class="muted" style="margin:0;">
                  Falls du keine Einladung erwartet hast, kannst du diese E-Mail ignorieren.
                </p>
              </td>
            </tr>
          </table>

          <div style="max-width:640px;margin:14px auto 0 auto;text-align:center;font-size:11px;color:#6f7682;">
            © ${year} Nils – Plex-Bibliothek
          </div>
        </td>
      </tr>
    </table>
  </body>
  </html>`;
  }

  private generateWelcomeEmailText(recipientName?: string, toolUrl?: string): string {
    const name = recipientName ? `Hi ${recipientName},` : 'Hi,';
    const url = toolUrl || 'http://localhost:4001';

    return [
      name,
      '',
      'hier ist dein Zugang zu Nils Plex-Bibliothek.',
      'Du kannst durch die Mediathek stöbern, Titel auf eine Merkliste setzen und diese anschließend per E-Mail versenden oder als JSON-Datei exportieren.',
      '',
      'So funktioniert es:',
      '1. Klicke auf „Jetzt öffnen“.',
      '2. Gib deine E-Mail-Adresse ein.',
      '3. Du bekommst einen einmaligen Anmeldecode per Mail.',
      '4. Code auf der Seite eingeben und loslegen.',
      '5. Stöbern, Merkliste befüllen und exportieren oder versenden.',
      '',
      `Jetzt öffnen: ${url}`,
      '',
      'Hinweis: Es ist kein separates Passwort nötig – nur deine E-Mail für den Einmal-Code.',
      'Wenn du beim Versenden der Merkliste die Option „Kopie an Nils“ aktivierst, erhalte ich automatisch deine Auswahl.',
      '',
      'Viel Spaß beim Stöbern!',
      'Nils',
    ].join('\n');
  }

  /**
   * Check if a welcome email has been sent to an email address
   */
  async hasReceivedWelcomeEmail(email: string): Promise<boolean> {
    const record = await db.query.welcomeEmails.findFirst({
      where: and(eq(welcomeEmails.email, email), eq(welcomeEmails.status, 'sent')),
    });
    return !!record;
  }

  /**
   * Get all welcome emails sent
   */
  async getAllWelcomeEmails(limit = 100) {
    return db.query.welcomeEmails.findMany({
      orderBy: [desc(welcomeEmails.sentAt)],
      limit,
    });
  }

  /**
   * Get welcome email statistics
   */
  async getStatistics() {
    const allEmails = await db.query.welcomeEmails.findMany();

    const total = allEmails.length;
    const sent = allEmails.filter((e) => e.status === 'sent').length;
    const failed = allEmails.filter((e) => e.status === 'failed').length;

    return {
      total,
      sent,
      failed,
      successRate: total > 0 ? ((sent / total) * 100).toFixed(2) + '%' : '0%',
    };
  }

  /**
   * Delete a welcome email entry by its identifier
   */
  async deleteWelcomeEmailById(id: string): Promise<number> {
    const result = db.delete(welcomeEmails).where(eq(welcomeEmails.id, id)).run();
    return 'changes' in result ? result.changes : 0;
  }

  /**
   * Delete all welcome email entries for a specific email address
   */
  async deleteWelcomeEmailsByEmail(email: string): Promise<number> {
    const result = db.delete(welcomeEmails).where(eq(welcomeEmails.email, email)).run();
    return 'changes' in result ? result.changes : 0;
  }

  /**
   * Clear the entire welcome email history
   */
  async clearWelcomeEmails(): Promise<number> {
    const result = db.delete(welcomeEmails).run();
    return 'changes' in result ? result.changes : 0;
  }
}

export const welcomeEmailService = new WelcomeEmailService();
