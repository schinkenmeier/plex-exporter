import { Router } from 'express';

import type { MailSender } from '../services/smtpService.js';

export interface NotificationsRouterOptions {
  smtpService: MailSender | null;
}

export const createNotificationsRouter = ({
  smtpService,
}: NotificationsRouterOptions) => {
  const router = Router();

  router.post('/test', async (req, res) => {
    if (!smtpService) {
      res.status(503).json({ error: 'SMTP service is not configured.' });
      return;
    }

    const { to, subject, message, html } = req.body ?? {};

    if (!to || !subject || (!message && !html)) {
      res
        .status(400)
        .json({ error: 'Fields "to", "subject" and at least one of "message" or "html" are required.' });
      return;
    }

    try {
      const result = await smtpService.sendMail({
        to,
        subject,
        text: message,
        html,
      });

      res.status(202).json({
        status: 'queued',
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected,
      });
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : 'Unknown error while sending notification.';
      res.status(502).json({ error: messageText });
    }
  });

  return router;
};

export default createNotificationsRouter;
