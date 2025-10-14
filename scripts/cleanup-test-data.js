import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pfade
const moviesDataDir = path.join(__dirname, '../data/exports/movies');
const seriesDataDir = path.join(__dirname, '../data/exports/series');
const moviesJsonPath = path.join(moviesDataDir, 'movies.json');
const seriesJsonPath = path.join(seriesDataDir, 'series_index.json');
const seriesDetailsDir = path.join(seriesDataDir, 'details');

console.log('Starting cleanup...\n');

// 1. Movies bereinigen
console.log('=== MOVIES ===');
const movieDirs = fs.readdirSync(moviesDataDir)
  .filter(name => name.startsWith('Movie - ') && name.endsWith('.images'))
  .map(name => name.replace('.images', ''));

console.log(`Found ${movieDirs.length} movie directories`);

const moviesJson = JSON.parse(fs.readFileSync(moviesJsonPath, 'utf8'));
const originalMoviesCount = moviesJson.length;

// Filtere nur die Filme, deren Verzeichnisse existieren
const filteredMovies = moviesJson.filter(movie => {
  const movieDirName = `Movie - ${movie.title} [${movie.ratingKey}]`;
  return movieDirs.includes(movieDirName);
});

console.log(`Original movies in JSON: ${originalMoviesCount}`);
console.log(`Filtered movies: ${filteredMovies.length}`);
console.log(`Removed: ${originalMoviesCount - filteredMovies.length}`);

// Speichere die bereinigte movies.json
fs.writeFileSync(moviesJsonPath, JSON.stringify(filteredMovies, null, 2), 'utf8');
console.log(`✓ movies.json updated\n`);

// 2. Series bereinigen
console.log('=== SERIES ===');
const seriesDirs = fs.readdirSync(seriesDataDir)
  .filter(name => name.startsWith('Show - ') && name.endsWith('.images'))
  .map(name => name.replace('.images', ''));

console.log(`Found ${seriesDirs.length} series directories`);

const seriesJson = JSON.parse(fs.readFileSync(seriesJsonPath, 'utf8'));
const originalSeriesCount = seriesJson.length;

// Filtere nur die Serien, deren Verzeichnisse existieren
const filteredSeries = seriesJson.filter(series => {
  const seriesDirName = `Show - ${series.title} [${series.ratingKey}]`;
  return seriesDirs.includes(seriesDirName);
});

console.log(`Original series in JSON: ${originalSeriesCount}`);
console.log(`Filtered series: ${filteredSeries.length}`);
console.log(`Removed: ${originalSeriesCount - filteredSeries.length}`);

// Speichere die bereinigte series_index.json
fs.writeFileSync(seriesJsonPath, JSON.stringify(filteredSeries, null, 2), 'utf8');
console.log(`✓ series_index.json updated\n`);

// 3. Nicht benötigte Series-Detail-JSONs löschen
console.log('=== SERIES DETAILS ===');
const detailFiles = fs.readdirSync(seriesDetailsDir)
  .filter(name => name.endsWith('.json'));

console.log(`Found ${detailFiles.length} detail JSON files`);

const keepRatingKeys = new Set(filteredSeries.map(s => s.ratingKey.toString()));
let deletedCount = 0;

detailFiles.forEach(filename => {
  // Extrahiere ratingKey aus dem Dateinamen (Format: {ratingKey}.json)
  const ratingKey = filename.replace('.json', '');
  if (!keepRatingKeys.has(ratingKey)) {
    const filePath = path.join(seriesDetailsDir, filename);
    fs.unlinkSync(filePath);
    deletedCount++;
    console.log(`  Deleted: ${filename}`);
  }
});

console.log(`\n✓ Deleted ${deletedCount} detail JSON files`);
console.log(`  Kept ${detailFiles.length - deletedCount} detail JSON files`);

console.log('\n=== CLEANUP COMPLETE ===');
