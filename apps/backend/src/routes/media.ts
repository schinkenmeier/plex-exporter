import { Router } from 'express';
import { z } from 'zod';

import type MediaRepository from '../repositories/mediaRepository.js';
import type { MediaCreateInput, MediaRecord, MediaUpdateInput } from '../repositories/mediaRepository.js';
import type ThumbnailRepository from '../repositories/thumbnailRepository.js';

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

  router.get('/', (_req, res) => {
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

  router.get('/:id', (req, res) => {
    const id = parseId(req.params.id);

    if (!id) {
      res.status(400).json({ error: 'Invalid media identifier.' });
      return;
    }

    const record = mediaRepository.getById(id);

    if (!record) {
      res.status(404).json({ error: 'Media not found.' });
      return;
    }

    const thumbnails = thumbnailRepository.listByMediaId(record.id);

    res.json(
      mapToResponse(
        record,
        thumbnails.map((thumbnail) => thumbnail.path),
      ),
    );
  });

  router.post('/', (req, res) => {
    const parsed = createMediaSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
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
        res.status(409).json({ error: 'Media with this Plex ID already exists.' });
        return;
      }

      throw error;
    }
  });

  router.put('/:id', (req, res) => {
    const id = parseId(req.params.id);

    if (!id) {
      res.status(400).json({ error: 'Invalid media identifier.' });
      return;
    }

    const parsed = updateMediaSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { thumbnails, ...updateData } = parsed.data;
    const updated = mediaRepository.update(id, toUpdateInput(updateData));

    if (!updated) {
      res.status(404).json({ error: 'Media not found.' });
      return;
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

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);

    if (!id) {
      res.status(400).json({ error: 'Invalid media identifier.' });
      return;
    }

    const deleted = mediaRepository.delete(id);

    if (!deleted) {
      res.status(404).json({ error: 'Media not found.' });
      return;
    }

    res.status(204).send();
  });

  return router;
};

export default createMediaRouter;
