import { Router, type NextFunction, type Request, type Response } from 'express';
import type { DrizzleDatabase } from '../../db/index.js';
import { HttpError } from '../../middleware/errorHandler.js';
import {
  DatabaseExplorerService,
  getSqliteClient,
  type DatabaseExplorerQueryRequest,
} from './databaseExplorerService.js';

export interface AdminDbExplorerRouterOptions {
  drizzleDatabase?: DrizzleDatabase;
}

const createService = (drizzleDatabase: DrizzleDatabase | null | undefined): DatabaseExplorerService => {
  if (!drizzleDatabase) {
    throw new HttpError(503, 'Database explorer is unavailable without an active SQLite connection.');
  }

  const sqlite = getSqliteClient(drizzleDatabase);
  if (!sqlite) {
    throw new HttpError(503, 'Database explorer is unavailable without an active SQLite connection.');
  }

  return new DatabaseExplorerService(sqlite);
};

const getTableParam = (req: Request): string => {
  const value = req.params.table;
  return Array.isArray(value) ? value[0] ?? '' : value;
};

export const createAdminDatabaseExplorerRouter = ({
  drizzleDatabase,
}: AdminDbExplorerRouterOptions): Router => {
  const router = Router();

  router.get('/tables', (_req: Request, res: Response, next: NextFunction) => {
    try {
      const service = createService(drizzleDatabase);
      res.json({
        success: true,
        data: {
          tables: service.listTables(),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/tables/:table/schema', (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = createService(drizzleDatabase);
      res.json({
        success: true,
        data: service.getSchema(getTableParam(req)),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/tables/:table/rows/query', (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = createService(drizzleDatabase);
      const result = service.queryRows(
        getTableParam(req),
        typeof req.body === 'object' && req.body !== null
          ? (req.body as DatabaseExplorerQueryRequest)
          : {},
      );
      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/tables/:table/filter-options', (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = createService(drizzleDatabase);
      res.json({
        success: true,
        data: service.getFilterOptions(getTableParam(req)),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};

export const createLegacyAdminDbExplorerRouter = (): Router => {
  const router = Router();
  const gone = (_req: Request, _res: Response, next: NextFunction) => {
    next(
      new HttpError(410, 'Legacy database explorer API has been replaced by /admin/api/database/*.', {
        responseExtensions: {
          replacement: '/admin/api/database',
        },
      }),
    );
  };

  router.get('/tables', gone);
  router.post('/query', gone);

  return router;
};

export default createAdminDatabaseExplorerRouter;
