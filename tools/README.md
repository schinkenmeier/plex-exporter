# Development Tools

This directory contains utility scripts and tools for development, build analysis, and data processing.

## Available Scripts

All scripts can be run using npm workspace commands from the project root:

```bash
npm run <script-name> --workspace @plex-exporter/tools
```

### 1. Series Splitter (`split_series.mjs`)

**Purpose:** Splits a large series JSON export file into an index file and individual detail files for better performance.

**Usage:**
```bash
npm run split:series --workspace @plex-exporter/tools
```

**What it does:**
- Reads a monolithic `series_full.json` file
- Extracts the series index (basic metadata for all series)
- Writes individual detail files for each series (`[ratingKey].json`)
- Creates an optimized `series.json` index file

**Input:**
```
data/exports/series/series_full.json
```

**Output:**
```
data/exports/series/
├── series.json          # Index with all series metadata
└── [ratingKey].json     # Individual series detail files
```

**Benefits:**
- Reduces initial load time (only loads index, not full details)
- Enables lazy loading of series details on demand
- Reduces memory usage for large libraries
- Improves API response times

**Example:**
```bash
# Place your full export at:
# data/exports/series/series_full.json

# Run the splitter:
npm run split:series --workspace @plex-exporter/tools

# Result:
# data/exports/series/series.json (index)
# data/exports/series/12345.json (detail for series with ratingKey 12345)
# data/exports/series/67890.json (detail for series with ratingKey 67890)
# ...
```

---

### 2. Bundle Analyzer (`analyze-bundle.mjs`)

**Purpose:** Analyzes frontend bundle sizes and provides insights into what's contributing to the build size.

**Usage:**
```bash
npm run analyze --workspace @plex-exporter/tools
```

**What it does:**
- Reads esbuild metafiles from the frontend build
- Calculates bundle sizes for JS and CSS
- Identifies largest dependencies
- Reports on bundle composition

**Requirements:**
- Frontend must be built first: `npm run build --workspace @plex-exporter/frontend`
- Metafiles must be generated (enabled by default in `apps/frontend/scripts/build.mjs`)

**Output:**
- Console report with bundle statistics
- Breakdown of largest modules
- Recommendations for optimization opportunities

**Use cases:**
- Identifying bundle bloat before deployment
- Tracking bundle size over time
- Finding optimization opportunities
- Debugging unexpected bundle size increases

---

### 3. Tautulli Mock Server (`tautulli-mock/`)

**Purpose:** A lightweight mock server that simulates Tautulli API responses for development and testing without requiring a real Tautulli instance.

**Location:** `tools/tautulli-mock/`

**Components:**
- `server.cjs` - Express-based mock server
- `Dockerfile` - Container configuration

**Usage via Docker Compose:**
```bash
# Start with the tautulli profile
docker-compose --profile tautulli up

# Or start all services including mock:
docker-compose --profile tautulli up -d
```

**Configuration:**
The mock server is defined in `docker-compose.yml`:

```yaml
tautulli-mock:
  build: ./tools/tautulli-mock
  ports:
    - "8181:8181"
  environment:
    - TAUTULLI_APIKEY=mock-api-key
```

**Endpoints:**
The mock server implements a subset of Tautulli API endpoints:

- `GET /api/v2?cmd=get_libraries` - Returns mock library data
- `GET /api/v2?cmd=get_library_media_info` - Returns mock media info
- Additional endpoints as needed for testing

**Use cases:**
- Frontend development without backend dependencies
- Integration testing
- CI/CD pipelines where Tautulli is unavailable
- Demos and presentations

**Customization:**
Edit `tools/tautulli-mock/server.cjs` to add or modify mock endpoints and responses.

---

## Directory Structure

```
tools/
├── package.json           # npm scripts and dependencies
├── split_series.mjs       # Series JSON splitter
├── analyze-bundle.mjs     # Bundle analysis tool
├── tautulli-mock/         # Mock Tautulli server
│   ├── Dockerfile        # Container definition
│   └── server.cjs        # Express mock server
└── README.md             # This file
```

---

## Development Workflow

### Adding New Tools

1. **Create the script:**
   ```bash
   touch tools/my-tool.mjs
   ```

2. **Add to package.json:**
   ```json
   {
     "scripts": {
       "my-tool": "node my-tool.mjs"
     }
   }
   ```

3. **Document in this README:**
   - Purpose
   - Usage
   - Input/output
   - Examples

4. **Add JSDoc comments:**
   ```javascript
   /**
    * My Tool - Does something useful
    *
    * @param {string} input - Input parameter
    * @returns {Promise<void>}
    */
   export async function myTool(input) {
     // Implementation
   }
   ```

### Testing Tools

Test scripts in isolation before integrating into the monorepo:

```bash
cd tools
node split_series.mjs [args]
```

---

## Common Use Cases

### Preparing Data for Import

```bash
# 1. Place Plex exports in data/exports/
# 2. Split large series file if needed:
npm run split:series --workspace @plex-exporter/tools

# 3. Import to database:
npm run import --workspace @plex-exporter/backend
```

### Optimizing Bundle Size

```bash
# 1. Build frontend:
npm run build --workspace @plex-exporter/frontend

# 2. Analyze bundles:
npm run analyze --workspace @plex-exporter/tools

# 3. Review output and identify optimization opportunities
```

### Testing with Mock Services

```bash
# 1. Start mock Tautulli:
docker-compose --profile tautulli up -d

# 2. Configure frontend to use mock:
# Update TAUTULLI_URL in .env to http://localhost:8181

# 3. Start frontend dev server:
npm run dev --workspace @plex-exporter/frontend
```

---

## Contributing

When adding new tools:

1. ✅ Keep tools simple and focused on one task
2. ✅ Add comprehensive JSDoc comments
3. ✅ Document in this README
4. ✅ Add usage examples
5. ✅ Consider error handling and validation
6. ✅ Use ES modules (`type: "module"`)
7. ✅ Test thoroughly before committing

---

## Related Documentation

- [Main README](../README.md) - Project overview
- [Frontend Build Scripts](../apps/frontend/scripts/) - Frontend-specific build tools
- [Backend Scripts](../apps/backend/src/scripts/) - Backend data processing scripts
- [Data Directory](../data/README.md) - Data structure and management

---

## Troubleshooting

### Script Not Found

```bash
Error: Cannot find module './tools/my-tool.mjs'
```

**Solution:** Ensure you're running from the project root and using the workspace flag:
```bash
npm run my-tool --workspace @plex-exporter/tools
```

### Permission Errors

```bash
Error: EACCES: permission denied
```

**Solution:** Check file permissions and ensure the script has execute rights:
```bash
chmod +x tools/my-tool.mjs
```

### Path Resolution Issues

Scripts in this directory should use paths relative to the project root since they're executed from there:

```javascript
// ✅ Correct
const inputPath = '../data/exports/series/series_full.json';

// ❌ Wrong (assumes running from tools/)
const inputPath = './data/exports/series/series_full.json';
```

---

## Future Improvements

Potential tools to add:

- 📊 Database migration utility
- 🧹 Cache cleanup script
- 📈 Performance profiling tool
- 🔍 Dependency audit reporter
- 🎨 Asset optimization tool
- 🧪 Test data generator
