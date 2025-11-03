import type { MailSender } from './resendService.js';
import logger from './logger.js';

export interface WatchlistItem {
  title: string;
  type: 'movie' | 'tv';
  year?: number | null;
  summary?: string | null;
  poster?: string | null;
}

class WatchlistEmailService {
  private mailSender: MailSender | null = null;

  /**
   * Set mail sender for email functionality
   */
  setMailSender(sender: MailSender): void {
    this.mailSender = sender;
  }

  /**
   * Send watchlist items via email
   */
  async sendWatchlistEmail(
    recipientEmail: string,
    items: WatchlistItem[],
    options?: {
      sendCopyToAdmin?: boolean;
      adminEmail?: string;
    }
  ): Promise<string> {
    if (!this.mailSender) {
      throw new Error('Mail sender not configured. Email functionality is disabled.');
    }

    if (items.length === 0) {
      throw new Error('No items provided to send');
    }

    const isAdminCopy = options?.sendCopyToAdmin && options?.adminEmail;

    // Build HTML email content
    const itemsList = items
      .map(
        (item) => `
          <div style="margin-bottom: 20px; padding: 15px; background: #f9f9f9; border-radius: 8px;">
            <h3 style="margin: 0 0 10px 0;">${item.title} ${item.year ? `(${item.year})` : ''}</h3>
            <p style="margin: 0; color: #666;">${item.type === 'movie' ? 'Film' : 'Serie'}</p>
            ${item.summary ? `<p style="margin: 10px 0 0 0; color: #333;">${item.summary.substring(0, 200)}${item.summary.length > 200 ? '...' : ''}</p>` : ''}
          </div>
        `
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Deine Merkliste</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px; margin-bottom: 30px;">
            <h1 style="margin: 0;">Deine Merkliste</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Hier sind die ${items.length} Titel, die du gemerkt hast</p>
          </div>
          ${itemsList}
          <div style="margin-top: 30px; padding: 20px; background: #f0f0f0; border-radius: 8px; text-align: center;">
            <p style="margin: 0; color: #666; font-size: 14px;">
              Diese E-Mail wurde von deinem Plex Exporter Merkliste gesendet.
            </p>
          </div>
        </body>
      </html>
    `;

    // Send to primary recipient
    const result = await this.mailSender.sendMail({
      to: recipientEmail,
      subject: `Deine Merkliste (${items.length} Titel)`,
      html,
    });

    logger.info('Watchlist email sent', { recipientEmail, itemCount: items.length, emailId: result.id });

    // Send copy to admin if requested
    if (isAdminCopy && options.adminEmail) {
      try {
        await this.mailSender.sendMail({
          to: options.adminEmail,
          subject: `[Kopie] Merkliste von ${recipientEmail} (${items.length} Titel)`,
          html,
        });
        logger.info('Watchlist admin copy sent', { adminEmail: options.adminEmail, recipientEmail, itemCount: items.length });
      } catch (error) {
        logger.error('Failed to send admin copy', { error, adminEmail: options.adminEmail });
        // Don't fail the main request if admin copy fails
      }
    }

    return result.id;
  }
}

export const watchlistEmailService = new WatchlistEmailService();
