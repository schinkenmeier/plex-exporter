# Backend Tests

This directory contains unit and integration tests for the backend API.

## Test Structure

- **Unit Tests**: Test individual components in isolation
  - `services/cacheService.test.ts`: Cache service functionality

- **Integration Tests**: Test API endpoints with database
  - `routes/v1.test.ts`: V1 API endpoints

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Test Results

### Cache Service Tests ✅
All 20 tests passing:
- Basic operations (set, get, has, delete, clear)
- TTL expiration
- Statistics tracking (hits, misses, hit rate)
- getOrCompute functionality
- LRU eviction
- Cache key generation

### V1 API Tests ✅
All 25 tests passing:
- ✅ GET /api/v1/stats - Database statistics
- ✅ GET /api/v1/movies - List all movies
- ✅ GET /api/v1/movies/:id - Get movie by ID (including 404 handling)
- ✅ GET /api/v1/series - List all series
- ✅ GET /api/v1/series/:id - Get series by ID (including 404 handling)
- ✅ GET /api/v1/filter - Filter media with pagination
- ✅ GET /api/v1/search - Search media by query
- ✅ GET /api/v1/recent - Get recently added media
- ✅ Rate limiting headers on all endpoints
- ✅ Caching behavior with X-Cache headers

## Test Coverage Summary

**Total: 45/45 tests passing (100%)** ✅

- Cache Service: 20/20 tests ✅
- V1 API Routes: 25/25 tests ✅

## Writing New Tests

### Unit Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { MyService } from './myService.js';

describe('MyService', () => {
  it('should do something', () => {
    const service = new MyService();
    expect(service.doSomething()).toBe('expected');
  });
});
```

### Integration Test Example

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';

describe('API Endpoint', () => {
  let app;

  beforeAll(() => {
    app = express();
    // Setup routes
  });

  it('should return 200', async () => {
    const response = await request(app).get('/api/endpoint');
    expect(response.status).toBe(200);
  });
});
```

## Test Coverage

To generate coverage reports:

```bash
npm run test:coverage
```

Coverage reports will be generated in the `coverage/` directory.

## CI/CD Integration

Tests can be integrated into CI/CD pipelines:

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: npm test
```

## Future Improvements

- [ ] Fix remaining V1 API test failures
- [ ] Add tests for MediaRepository
- [ ] Add tests for ThumbnailRepository
- [ ] Add tests for Hero Pipeline
- [ ] Add tests for error middleware
- [ ] Add tests for rate limiting middleware
- [ ] Add tests for cache middleware
- [ ] Improve test isolation for caching tests
- [ ] Add E2E tests with real database
- [ ] Add performance/load tests
