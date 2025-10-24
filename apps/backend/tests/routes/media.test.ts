import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import MediaRepository from '../../src/repositories/mediaRepository.js';
import ThumbnailRepository from '../../src/repositories/thumbnailRepository.js';
import { createMediaRouter } from '../../src/routes/media.js';
import { createTestDatabase, type TestDatabaseHandle } from '../helpers/testDatabase.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

const createApp = (mediaRepository: MediaRepository, thumbnailRepository: ThumbnailRepository) => {
  const app = express();
  app.use(express.json());
  app.use('/media', createMediaRouter({ mediaRepository, thumbnailRepository }));
  app.use(errorHandler);
  return app;
};

describe('media routes', () => {
  let dbHandle: TestDatabaseHandle;
  let mediaRepository: MediaRepository;
  let thumbnailRepository: ThumbnailRepository;
  let app: express.Express;

  beforeEach(() => {
    dbHandle = createTestDatabase();
    mediaRepository = new MediaRepository(dbHandle.drizzle);
    thumbnailRepository = new ThumbnailRepository(dbHandle.drizzle);
    app = createApp(mediaRepository, thumbnailRepository);
  });

  afterEach(() => {
    dbHandle.cleanup();
  });

  it('creates media entries and persists thumbnail paths', async () => {
    const response = await request(app).post('/media').send({
      plexId: 'plex-item-1',
      title: 'Example Item',
      librarySectionId: 5,
      mediaType: 'movie',
      thumbnails: ['/tmp/poster.jpg', '/tmp/poster.jpg'],
    });

    expect(response.status).toBe(201);
    expect(response.body.title).toBe('Example Item');
    expect(response.body.thumbnails).toEqual(['/tmp/poster.jpg']);

    const listResponse = await request(app).get('/media');
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.media).toHaveLength(1);
    expect(listResponse.body.media[0].thumbnails).toEqual(['/tmp/poster.jpg']);
  });

  it('updates media metadata and thumbnail references', async () => {
    const createResponse = await request(app).post('/media').send({
      plexId: 'plex-item-2',
      title: 'Initial Title',
      thumbnails: ['/tmp/thumb1.png'],
    });

    const mediaId = createResponse.body.id;

    const updateResponse = await request(app)
      .put(`/media/${mediaId}`)
      .send({
        title: 'Updated Title',
      mediaType: 'tv',
        thumbnails: ['/tmp/thumb2.png', '/tmp/thumb3.png'],
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.title).toBe('Updated Title');
    expect(updateResponse.body.mediaType).toBe('tv');
    expect(updateResponse.body.thumbnails).toEqual(['/tmp/thumb2.png', '/tmp/thumb3.png']);

    const storedThumbnails = thumbnailRepository.listByMediaId(mediaId).map((thumb) => thumb.path);
    expect(storedThumbnails).toEqual(['/tmp/thumb2.png', '/tmp/thumb3.png']);
  });

  it('returns 404 for unknown media ids', async () => {
    const response = await request(app).get('/media/9999');
    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe('Media not found.');
  });

  it('validates media identifiers', async () => {
    const response = await request(app).get('/media/invalid');
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Invalid media identifier.');
  });

  it('prevents duplicate Plex identifiers', async () => {
    const payload = { plexId: 'plex-item-3', title: 'Duplicate Test' };

    const firstResponse = await request(app).post('/media').send(payload);
    expect(firstResponse.status).toBe(201);

    const secondResponse = await request(app).post('/media').send(payload);
    expect(secondResponse.status).toBe(409);
    expect(secondResponse.body.error.message).toBe('Media with this Plex ID already exists.');
  });

  it('returns 404 when deleting unknown media items', async () => {
    const response = await request(app).delete('/media/1234');
    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe('Media not found.');
  });

  it('deletes media items and cascades thumbnails', async () => {
    const createResponse = await request(app).post('/media').send({
      plexId: 'plex-item-4',
      title: 'Delete Me',
      thumbnails: ['/tmp/delete.png'],
    });

    const mediaId = createResponse.body.id;

    const deleteResponse = await request(app).delete(`/media/${mediaId}`);
    expect(deleteResponse.status).toBe(204);

    const getResponse = await request(app).get(`/media/${mediaId}`);
    expect(getResponse.status).toBe(404);
    expect(getResponse.body.error.message).toBe('Media not found.');

    const thumbnails = thumbnailRepository.listByMediaId(mediaId);
    expect(thumbnails).toHaveLength(0);
  });
});
