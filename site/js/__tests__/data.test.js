import { describe, it } from 'node:test';
import assert from 'node:assert';

const { prefixThumbValue, prefixMovieThumb, prefixShowThumb } = await import('../data.js');

describe('prefixThumbValue', () => {
  it('normalizes leading parent directory segments', () => {
    const result = prefixThumbValue('../poster.jpg', 'data/movies/');
    assert.strictEqual(result, 'data/movies/poster.jpg');
    assert.ok(!result.includes('..'));
  });

  it('normalizes backslash parent directory segments', () => {
    const result = prefixThumbValue('..\\poster.jpg', 'data/movies/');
    assert.strictEqual(result, 'data/movies/poster.jpg');
  });

  it('handles mixed slashes and dot segments', () => {
    const result = prefixThumbValue('./covers/../thumbs/.//poster.jpg', 'data/movies');
    assert.strictEqual(result, 'data/movies/thumbs/poster.jpg');
  });

  it('returns base directory when only parent segments remain', () => {
    const result = prefixThumbValue('../', 'data/movies/');
    assert.strictEqual(result, 'data/movies/');
  });

  it('preserves absolute data paths without duplicating base', () => {
    const result = prefixThumbValue('data/movies/poster.jpg', 'data/movies/');
    assert.strictEqual(result, 'data/movies/poster.jpg');
  });
});

describe('prefixThumb helpers', () => {
  it('prefixMovieThumb removes relative segments for thumbFile', () => {
    const movie = { thumb: '../poster.jpg' };
    const result = prefixMovieThumb(movie);
    assert.strictEqual(result.thumb, 'data/movies/poster.jpg');
    assert.strictEqual(result.thumbFile, 'data/movies/poster.jpg');
    assert.ok(!result.thumb.includes('..'));
  });

  it('prefixShowThumb removes relative segments for thumbFile', () => {
    const show = { thumb: '..\\season/poster.jpg' };
    const result = prefixShowThumb(show);
    assert.strictEqual(result.thumb, 'data/series/season/poster.jpg');
    assert.strictEqual(result.thumbFile, 'data/series/season/poster.jpg');
    assert.ok(!result.thumb.includes('..'));
  });
});
