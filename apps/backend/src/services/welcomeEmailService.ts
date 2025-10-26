import { db } from '../db/globalDb.js';
import { welcomeEmails, type InsertWelcomeEmail } from '../db/schema.js';
import type { MailSender } from './resendService.js';
import logger from './logger.js';
import { eq, desc } from 'drizzle-orm';

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

    try {
      const result = await this.mailSender.sendMail({
        to: recipientEmail,
        subject: 'Welcome to Plex Exporter!',
        html,
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
    const greeting = recipientName ? `Hello ${recipientName}` : 'Hello';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Welcome to Plex Exporter</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 12px; margin-bottom: 30px; text-align: center;">
            <h1 style="margin: 0 0 10px 0; font-size: 32px;">Welcome to Plex Exporter!</h1>
            <p style="margin: 0; font-size: 18px; opacity: 0.9;">Your media library management companion</p>
          </div>

          <div style="background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <h2 style="margin: 0 0 20px 0; color: #667eea;">${greeting}!</h2>

            <p style="margin: 0 0 15px 0;">
              Thank you for using Plex Exporter. This powerful tool helps you manage and organize your Plex media library with ease.
            </p>

            <h3 style="margin: 25px 0 15px 0; color: #764ba2;">What can you do with Plex Exporter?</h3>

            <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <ul style="margin: 0; padding-left: 20px;">
                <li style="margin-bottom: 10px;">
                  <strong>Browse your media:</strong> View all your movies and TV series in a beautiful interface
                </li>
                <li style="margin-bottom: 10px;">
                  <strong>Bookmark favorites:</strong> Save your favorite items and get them sent to your email
                </li>
                <li style="margin-bottom: 10px;">
                  <strong>Get notifications:</strong> Subscribe to newsletters about newly added content
                </li>
                <li style="margin-bottom: 10px;">
                  <strong>Rich metadata:</strong> Explore detailed information including cast, ratings, and summaries
                </li>
                <li style="margin-bottom: 10px;">
                  <strong>Search & Filter:</strong> Find exactly what you're looking for with powerful search
                </li>
              </ul>
            </div>

            <h3 style="margin: 25px 0 15px 0; color: #764ba2;">Getting Started</h3>

            <p style="margin: 0 0 15px 0;">
              Start exploring your media library by accessing the application:
            </p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${toolUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 15px 30px; border-radius: 8px; font-weight: bold; font-size: 16px;">
                Open Plex Exporter
              </a>
            </div>

            <h3 style="margin: 25px 0 15px 0; color: #764ba2;">Need Help?</h3>

            <p style="margin: 0 0 15px 0;">
              If you have any questions or need assistance, feel free to reach out. We're here to help you get the most out of your Plex library!
            </p>

            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0; color: #666; font-size: 14px; text-align: center;">
                Happy browsing!<br>
                <strong>The Plex Exporter Team</strong>
              </p>
            </div>
          </div>

          <div style="margin-top: 30px; text-align: center; color: #666; font-size: 12px;">
            <p style="margin: 5px 0;">
              This is an automated welcome email from Plex Exporter.
            </p>
            <p style="margin: 5px 0;">
              You received this email because someone requested it for this address.
            </p>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Check if a welcome email has been sent to an email address
   */
  async hasReceivedWelcomeEmail(email: string): Promise<boolean> {
    const record = await db.query.welcomeEmails.findFirst({
      where: eq(welcomeEmails.email, email),
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
}

export const welcomeEmailService = new WelcomeEmailService();
