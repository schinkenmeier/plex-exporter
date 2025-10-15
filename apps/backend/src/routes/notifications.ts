import { Router, type NextFunction, type Request, type Response } from 'express';

import type { MailSender } from '../services/smtpService.js';
import { HttpError } from '../middleware/errorHandler.js';

export interface NotificationsRouterOptions {
  smtpService: MailSender | null;
}

export const createNotificationsRouter = ({
  smtpService,
}: NotificationsRouterOptions) => {
  const router = Router();

  router.post('/test', async (req: Request, res: Response, next: NextFunction) => {
    if (!smtpService) {
      return next(new HttpError(503, 'SMTP service is not configured.'));
    }

    const { to, subject, message, html } = req.body ?? {};

    if (!to || !subject || (!message && !html)) {
      return next(
        new HttpError(
          400,
          'Fields "to", "subject" and at least one of "message" or "html" are required.',
        ),
      );
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
      next(new HttpError(502, messageText));
    }
  });

  return router;
};

export default createNotificationsRouter;
