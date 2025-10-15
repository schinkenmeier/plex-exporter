import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

import type MediaRepository from '../repositories/mediaRepository.js';
import type { MediaCreateInput, MediaRecord, MediaUpdateInput } from '../repositories/mediaRepository.js';
import type ThumbnailRepository from '../repositories/thumbnailRepository.js';
import { HttpError } from '../middleware/errorHandler.js';

export interface MediaRouterOptions {
  mediaRepository: MediaRepository;
  thumbnailRepository: ThumbnailRepository;
}

const createMediaSchema = z.object({
  plexId: z.string().trim().min(1, 'plexId is required'),
  title: z.string().trim().min(1, 'title is required'),
  librarySectionId: z.number().int().nullable().optional(),
  mediaType: z.string().trim().min(1).nullable().optional(),
  year: z.number().int().nullable().optional(),
  guid: z.string().trim().min(1).nullable().optional(),
  summary: z.string().nullable().optional(),
  plexAddedAt: z.string().trim().min(1).nullable().optional(),
  plexUpdatedAt: z.string().trim().min(1).nullable().optional(),
  thumbnails: z.array(z.string().trim().min(1)).optional(),
});

const updateMediaSchema = createMediaSchema
  .omit({ plexId: true, title: true })
  .extend({
    plexId: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).optional(),
    thumbnails: z.array(z.string().trim().min(1)).optional(),
  });

const mapToResponse = (media: MediaRecord, thumbnailPaths: string[]) => ({
  id: media.id,
  plexId: media.plexId,
  title: media.title,
  librarySectionId: media.librarySectionId,
  mediaType: media.mediaType,
  year: media.year,
  guid: media.guid,
  summary: media.summary,
  plexAddedAt: media.plexAddedAt,
  plexUpdatedAt: media.plexUpdatedAt,
  createdAt: media.createdAt,
  updatedAt: media.updatedAt,
  thumbnails: thumbnailPaths,
});

const parseId = (value: string) => {
  const id = Number.parseInt(value, 10);

  if (Number.isNaN(id) || id <= 0) {
    return null;
  }

  return id;
};

const uniquePaths = (paths: string[] = []) => Array.from(new Set(paths));

const toUpdateInput = (data: z.infer<typeof updateMediaSchema>): MediaUpdateInput => ({
  plexId: data.plexId,
  title: data.title,
  librarySectionId: data.librarySectionId,
  mediaType: data.mediaType,
  year: data.year,
  guid: data.guid,
  summary: data.summary,
  plexAddedAt: data.plexAddedAt,
  plexUpdatedAt: data.plexUpdatedAt,
});

const toCreateInput = (data: z.infer<typeof createMediaSchema>): MediaCreateInput => ({
  plexId: data.plexId,
  title: data.title,
  librarySectionId: data.librarySectionId,
  mediaType: data.mediaType,
  year: data.year,
  guid: data.guid,
  summary: data.summary,
  plexAddedAt: data.plexAddedAt,
  plexUpdatedAt: data.plexUpdatedAt,
});

export const createMediaRouter = ({ mediaRepository, thumbnailRepository }: MediaRouterOptions) => {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    const mediaRecords = mediaRepository.listAll();
    const items = mediaRecords.map((record) => {
      const thumbnails = thumbnailRepository.listByMediaId(record.id);
      return mapToResponse(
        record,
        thumbnails.map((thumbnail) => thumbnail.path),
      );
    });

    res.json({ media: items });
  });

  router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
    const id = parseId(req.params.id);

    if (!id) {
      return next(new HttpError(400, 'Invalid media identifier.'));
    }

    const record = mediaRepository.getById(id);

    if (!record) {
      return next(new HttpError(404, 'Media not found.'));
    }

    const thumbnails = thumbnailRepository.listByMediaId(record.id);

    res.json(
      mapToResponse(
        record,
        thumbnails.map((thumbnail) => thumbnail.path),
      ),
    );
  });

  router.post('/', (req: Request, res: Response, next: NextFunction) => {
    const parsed = createMediaSchema.safeParse(req.body);

    if (!parsed.success) {
      return next(new HttpError(400, 'Validation failed', { details: parsed.error.flatten() }));
    }

    const { thumbnails = [], ...mediaData } = parsed.data;

    try {
      const media = mediaRepository.create(toCreateInput(mediaData));
      const storedThumbnails = thumbnails.length
        ? thumbnailRepository.replaceForMedia(media.id, uniquePaths(thumbnails))
        : thumbnailRepository.listByMediaId(media.id);

      res.status(201).json(
        mapToResponse(
          media,
          storedThumbnails.map((thumbnail) => thumbnail.path),
        ),
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        return next(new HttpError(409, 'Media with this Plex ID already exists.'));
      }

      next(error);
    }
  });

  router.put('/:id', (req: Request, res: Response, next: NextFunction) => {
    const id = parseId(req.params.id);

    if (!id) {
      return next(new HttpError(400, 'Invalid media identifier.'));
    }

    const parsed = updateMediaSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      return next(new HttpError(400, 'Validation failed', { details: parsed.error.flatten() }));
    }

    const { thumbnails, ...updateData } = parsed.data;
    const updated = mediaRepository.update(id, toUpdateInput(updateData));

    if (!updated) {
      return next(new HttpError(404, 'Media not found.'));
    }

    const storedThumbnails = Array.isArray(thumbnails)
      ? thumbnailRepository.replaceForMedia(id, uniquePaths(thumbnails))
      : thumbnailRepository.listByMediaId(id);

    res.json(
      mapToResponse(
        updated,
        storedThumbnails.map((thumbnail) => thumbnail.path),
      ),
    );
  });

  router.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
    const id = parseId(req.params.id);

    if (!id) {
      return next(new HttpError(400, 'Invalid media identifier.'));
    }

    const deleted = mediaRepository.delete(id);

    if (!deleted) {
      return next(new HttpError(404, 'Media not found.'));
    }

    res.status(204).send();
  });

  return router;
};

export default createMediaRouter;
