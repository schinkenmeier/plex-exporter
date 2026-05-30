import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { HttpError } from '../../middleware/errorHandler.js';
import WatchlistRequestRepository, {
  isWatchlistRequestStatus,
  WATCHLIST_REQUEST_STATUSES,
} from '../../repositories/watchlistRequestRepository.js';
import type { WatchlistRequestStatus } from '../../repositories/watchlistRequestRepository.js';
import { watchlistEmailService } from '../../services/watchlistEmailService.js';
import logger from '../../services/logger.js';

export interface AdminWatchlistRequestsRouterOptions {
  watchlistRequestRepository: WatchlistRequestRepository;
}

const statusSchema = z.enum(WATCHLIST_REQUEST_STATUSES);

const listQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const updateStatusSchema = z.object({
  status: statusSchema,
  message: z.string().trim().min(1).max(5000).nullable().optional(),
});

const updateNoteSchema = z.object({
  adminNote: z.string().trim().max(5000).nullable().optional(),
});

const replySchema = z.object({
  subject: z.string().trim().min(1).max(200).optional(),
  message: z.string().trim().min(1).max(5000),
  status: statusSchema.optional(),
});

const replyTemplates = [
  { key: 'accept', label: 'Annehmen', message: 'Kann ich machen.' },
  { key: 'park', label: 'Parken', message: 'Ich parke das erstmal.' },
  { key: 'reject', label: 'Ablehnen', message: 'Kann ich leider nicht machen.' },
  { key: 'done', label: 'Erledigt', message: 'Ist erledigt.' },
] as const;

export const createAdminWatchlistRequestsRouter = ({
  watchlistRequestRepository,
}: AdminWatchlistRequestsRouterOptions): Router => {
  const router = Router();

  router.get('/reply-templates', (_req: Request, res: Response) => {
    res.json({
      success: true,
      templates: replyTemplates,
    });
  });

  router.get('/requests/summary', (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({
        success: true,
        ...watchlistRequestRepository.getSummary(),
      });
    } catch (error) {
      logger.error('Failed to build watchlist request summary', { error });
      next(new HttpError(500, 'Failed to build watchlist request summary'));
    }
  });

  router.get('/requests', (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listQuerySchema.parse(req.query);
      const status = query.status && isWatchlistRequestStatus(query.status)
        ? query.status
        : null;

      if (query.status && !status) {
        return next(new HttpError(400, 'Invalid watchlist request status'));
      }

      const requests = watchlistRequestRepository.list({
        status,
        limit: query.limit,
        offset: query.offset,
      });
      const total = watchlistRequestRepository.count({ status });

      res.json({
        success: true,
        requests,
        pagination: {
          total,
          limit: query.limit ?? 50,
          offset: query.offset ?? 0,
          hasMore: (query.offset ?? 0) + requests.length < total,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, 'Invalid watchlist request query', { details: error.issues }));
      }
      logger.error('Failed to list watchlist requests', { error });
      next(new HttpError(500, 'Failed to list watchlist requests'));
    }
  });

  router.get('/requests/:id', (req: Request, res: Response, next: NextFunction) => {
    const requestId = String(req.params.id);
    const requestRecord = watchlistRequestRepository.getById(requestId);
    if (!requestRecord) {
      return next(new HttpError(404, 'Watchlist request not found'));
    }

    res.json({
      success: true,
      request: requestRecord,
      events: watchlistRequestRepository.listEvents(requestRecord.id),
    });
  });

  router.patch('/requests/:id/status', (req: Request, res: Response, next: NextFunction) => {
    const requestId = String(req.params.id);
    try {
      const { status, message } = updateStatusSchema.parse(req.body);
      const updated = watchlistRequestRepository.updateStatus(requestId, status, message ?? null);
      if (!updated) {
        return next(new HttpError(404, 'Watchlist request not found'));
      }

      res.json({
        success: true,
        request: updated,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, 'Invalid watchlist request status', { details: error.issues }));
      }
      logger.error('Failed to update watchlist request status', { error, requestId });
      next(new HttpError(500, 'Failed to update watchlist request status'));
    }
  });

  router.patch('/requests/:id/note', (req: Request, res: Response, next: NextFunction) => {
    const requestId = String(req.params.id);
    try {
      const { adminNote } = updateNoteSchema.parse(req.body);
      const updated = watchlistRequestRepository.updateAdminNote(
        requestId,
        adminNote && adminNote.length > 0 ? adminNote : null,
      );
      if (!updated) {
        return next(new HttpError(404, 'Watchlist request not found'));
      }

      res.json({
        success: true,
        request: updated,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, 'Invalid watchlist request note', { details: error.issues }));
      }
      logger.error('Failed to update watchlist request note', { error, requestId });
      next(new HttpError(500, 'Failed to update watchlist request note'));
    }
  });

  router.post('/requests/:id/reply', async (req: Request, res: Response, next: NextFunction) => {
    const requestId = String(req.params.id);
    try {
      const requestRecord = watchlistRequestRepository.getById(requestId);
      if (!requestRecord) {
        return next(new HttpError(404, 'Watchlist request not found'));
      }

      const payload = replySchema.parse(req.body);
      const emailId = await watchlistEmailService.sendRequestReply({
        recipientEmail: requestRecord.requesterEmail,
        subject: payload.subject,
        message: payload.message,
        requestId: requestRecord.id,
      });

      const updated = watchlistRequestRepository.recordReply({
        requestId: requestRecord.id,
        message: payload.message,
        emailId,
        status: payload.status as WatchlistRequestStatus | undefined,
      });

      res.json({
        success: true,
        request: updated,
        emailId,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, 'Invalid watchlist reply payload', { details: error.issues }));
      }
      if (error instanceof Error && error.message.includes('Mail sender not configured')) {
        return next(new HttpError(503, 'Resend service is not configured'));
      }
      logger.error('Failed to send watchlist request reply', { error, requestId });
      next(new HttpError(500, 'Failed to send watchlist request reply'));
    }
  });

  return router;
};

export default createAdminWatchlistRequestsRouter;
