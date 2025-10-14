import express from 'express';
import healthRouter from './routes/health.js';

const app = express();

app.use(express.json());
app.use('/health', healthRouter);

const port = Number.parseInt(process.env.PORT ?? '4000', 10);

app.listen(port, () => {
  console.log(`Plex Exporter backend listening on http://localhost:${port}`);
});

export default app;
