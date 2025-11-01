# Data Directory

This directory contains local development data and runtime application data. All contents are gitignored and should not be committed to the repository.

## Directory Structure

```
data/
├── sqlite/              # SQLite database files (development & production)
│   ├── plex-exporter.sqlite     # Main database
│   ├── plex-exporter.sqlite-shm # Shared memory file (SQLite WAL mode)
│   └── plex-exporter.sqlite-wal # Write-ahead log (SQLite WAL mode)
└── exports/             # Plex export JSON files (optional, for import)
    ├── movies/          # Movie library exports
    │   └── movies.json
    └── series/          # TV series exports
        ├── series.json  # Series index
        └── *.json       # Individual series details
```

## Git Ignore Rules

The following patterns are ignored in `.gitignore`:

- `data/sqlite/` - All SQLite database files
- `data/exports/*.sqlite` - SQLite exports
- `apps/*/data/` - App-specific data directories

## Database Files

### SQLite WAL Mode

The database uses SQLite's Write-Ahead Logging (WAL) mode, which creates three files:

1. **`.sqlite`** - Main database file
2. **`.sqlite-shm`** - Shared memory file for coordination
3. **`.sqlite-wal`** - Write-ahead log for transactions

These files work together and should not be separated. If you need to backup or copy the database, copy all three files.

### Location

The database location is configured via environment variables:

- `SQLITE_PATH` - Full path to the database file (default: `./data/sqlite/plex-exporter.sqlite`)

See `apps/backend/.env.example` for configuration details.

## Export Files

### Plex Export Format

If you're using the import functionality, place Plex export files in the appropriate directories:

**Movies:**
```bash
data/exports/movies/movies.json
```

**Series:**
```bash
data/exports/series/series.json        # Index file
data/exports/series/[ratingKey].json   # Detail files
```

### Generating Exports

Export files should be generated from your Plex Media Server. Refer to the main README for instructions on:

- Using Plex export tools
- Running the import script: `npm run import --workspace @plex-exporter/backend`

### Splitting Large Series Files

If you have a single large `series_full.json` file, use the split tool:

```bash
npm run split:series --workspace @plex-exporter/tools
```

This will split the file into an index and individual detail files for better performance.

## Development vs. Production

### Development

In development, the `data/` directory is typically located at the project root:

```
plex-exporter/data/sqlite/plex-exporter.sqlite
```

### Docker/Production

In Docker deployments, the `data/` directory is mounted as a volume:

```yaml
volumes:
  - ./data:/app/data  # Maps host ./data to container /app/data
```

The backend will use the `SQLITE_PATH` environment variable to locate the database.

## Troubleshooting

### Database Locked

If you encounter "database is locked" errors:

1. Ensure only one process is accessing the database
2. Check that no zombie processes are holding locks
3. Delete `.sqlite-shm` and `.sqlite-wal` files (safe when database is not in use)

### Missing Database

On first run, the backend will automatically create the database and run migrations. If the database is missing:

1. Ensure the `data/sqlite/` directory exists
2. Check that the backend has write permissions
3. Verify `SQLITE_PATH` points to the correct location

### Export File Errors

If imports fail:

1. Verify JSON files are valid (use `jq` or a JSON validator)
2. Check file permissions
3. Ensure file structure matches expected format
4. Review backend logs for specific error messages

## Best Practices

1. **Never commit `data/` contents** - All data files are gitignored for a reason
2. **Backup regularly** - Copy all three SQLite files together for backups
3. **Use volumes in Docker** - Mount `data/` as a volume for persistence
4. **Monitor disk space** - WAL files can grow large; SQLite checkpoints periodically
5. **Don't manually edit** - Use the API or scripts to modify data

## Related Documentation

- [Backend README](../apps/backend/README.md) - Backend setup and configuration
- [Main README](../README.md) - Project overview and setup
- [Import Scripts](../apps/backend/src/scripts/) - Data import utilities
