import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import pinoHttp from 'pino-http';
import { loadConfig, type AppConfig } from './config';
import { createChaosMiddleware } from './chaos';
import { createLogger } from './logger';
import { createMetrics, type AppMetrics } from './metrics';
import { createScoreStore, type ScoreStore } from './storage';
import { tracer } from './tracing';

interface AppState {
  app: express.Express;
  config: AppConfig;
  metrics: AppMetrics;
  store: ScoreStore;
  logger: ReturnType<typeof createLogger>;
}

const normalizeRouteLabel = (req: Request, routeLabel?: string): string => {
  if (routeLabel) {
    return routeLabel;
  }

  if (req.path.startsWith('/assets/')) {
    return '/assets/*';
  }

  return req.path || '/';
};

const withRoute =
  (route: string, handler: (req: Request, res: Response, next: NextFunction) => void | Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    res.locals.routeLabel = route;
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };

const validateScorePayload = (
  body: unknown,
): { player: string; score: number } | { error: string } => {
  if (!body || typeof body !== 'object') {
    return { error: 'Body must be an object' };
  }

  const maybeBody = body as { player?: unknown; score?: unknown };

  const score = Math.floor(Number(maybeBody.score));
  if (!Number.isFinite(score) || score < 0) {
    return { error: 'score must be a non-negative number' };
  }

  const player =
    typeof maybeBody.player === 'string' && maybeBody.player.trim().length > 0
      ? maybeBody.player.trim().slice(0, 40)
      : 'Guest';

  return { player, score };
};

export const createAppState = async (
  overrides?: Partial<{
    config: AppConfig;
    metrics: AppMetrics;
    store: ScoreStore;
    logger: ReturnType<typeof createLogger>;
  }>,
): Promise<AppState> => {
  const config = overrides?.config ?? loadConfig();
  const logger = overrides?.logger ?? createLogger();
  const metrics = overrides?.metrics ?? createMetrics();
  const store = overrides?.store ?? (await createScoreStore(config.dbPath, logger));

  const app = express();
  app.disable('x-powered-by');

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const headerId = req.headers['x-request-id'];
        const requestId = typeof headerId === 'string' ? headerId : randomUUID();
        res.setHeader('x-request-id', requestId);
        return requestId;
      },
      customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) {
          return 'error';
        }
        if (res.statusCode >= 400) {
          return 'warn';
        }
        if (
          req.url?.startsWith('/healthz') ||
          req.url?.startsWith('/readyz') ||
          req.url?.startsWith('/metrics')
        ) {
          return 'debug';
        }
        return 'info';
      },
      customProps: (req) => ({ request_id: req.id }),
    }),
  );

  app.use((req, res, next) => {
    const stopTimer = metrics.httpRequestDuration.startTimer();

    res.on('finish', () => {
      const routeLabel = normalizeRouteLabel(req, res.locals.routeLabel as string | undefined);
      const method = req.method;
      const status = String(res.statusCode);
      metrics.httpRequestsTotal.inc({ route: routeLabel, method, status });
      stopTimer({ route: routeLabel, method, status });
    });

    next();
  });

  app.use(createChaosMiddleware({ config: config.chaos, logger, metrics }));

  app.get(
    '/healthz',
    withRoute('/healthz', async (_req, res) => {
      res.status(200).json({ status: 'ok' });
    }),
  );

  app.get(
    '/readyz',
    withRoute('/readyz', async (_req, res) => {
      const status = store.ready ? 200 : 503;
      res.status(status).json({
        status: store.ready ? 'ready' : 'not_ready',
        storage_mode: store.mode,
      });
    }),
  );

  app.post(
    '/game-start',
    withRoute('/game-start', async (_req, res) => {
      metrics.gamesStartedTotal.inc();
      res.status(202).json({ accepted: true });
    }),
  );

  app.post(
    '/score',
    withRoute('/score', async (req, res) => {
      const span = tracer.startSpan('score.submit');
      try {
        const validated = validateScorePayload(req.body);
        if ('error' in validated) {
          span.setAttribute('app.validation_error', validated.error);
          res.status(400).json({ error: validated.error });
          return;
        }

        const payload = {
          player: validated.player,
          score: validated.score,
          createdAt: new Date().toISOString(),
        };

        await store.insertScore(payload);
        const highScore = await store.getHighScore();

        metrics.gamesCompletedTotal.inc();
        metrics.highScoreGauge.set(highScore);

        span.setAttribute('app.score', payload.score);
        span.setAttribute('app.high_score', highScore);

        res.status(201).json({
          stored: payload,
          highScore,
        });
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    }),
  );

  app.get(
    '/leaderboard',
    withRoute('/leaderboard', async (_req, res) => {
      const span = tracer.startSpan('leaderboard.query');
      try {
        const leaderboard = await store.getLeaderboard(10);
        res.status(200).json({ leaderboard });
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    }),
  );

  app.get(
    '/metrics',
    withRoute('/metrics', async (_req, res) => {
      res.setHeader('Content-Type', metrics.registry.contentType);
      res.send(await metrics.registry.metrics());
    }),
  );

  if (fs.existsSync(config.staticDir)) {
    app.use(express.static(config.staticDir));
    app.get(
      '*',
      withRoute('/*', async (req, res, next) => {
        if (req.path.startsWith('/healthz') || req.path.startsWith('/readyz') || req.path.startsWith('/metrics')) {
          next();
          return;
        }
        res.sendFile(path.join(config.staticDir, 'index.html'));
      }),
    );
  } else {
    logger.warn({ staticDir: config.staticDir }, 'Static directory missing; API mode only');
  }

  app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    void next;
    req.log.error({ err: error, request_id: req.id }, 'Unhandled request error');
    res.status(500).json({
      error: 'Internal server error',
      request_id: req.id,
    });
  });

  const highScore = await store.getHighScore();
  metrics.highScoreGauge.set(highScore);

  return {
    app,
    config,
    logger,
    metrics,
    store,
  };
};
