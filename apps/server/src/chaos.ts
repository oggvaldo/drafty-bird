import type { NextFunction, Request, Response } from 'express';
import type pino from 'pino';
import type { ChaosConfig } from './config';
import type { AppMetrics } from './metrics';
import { tracer } from './tracing';

interface ChaosOptions {
  config: ChaosConfig;
  logger: pino.Logger;
  metrics: AppMetrics;
}

const createDeterministicRng = (seedInput: number) => {
  let seed = seedInput >>> 0;

  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
};

const matchRoute = (req: Request, routes: Set<string>): boolean => {
  if (routes.has(req.path)) {
    return true;
  }

  const cleanPath = req.path.endsWith('/') && req.path !== '/' ? req.path.slice(0, -1) : req.path;
  return routes.has(cleanPath);
};

const resolveLatencyMs = (
  nextRandom: () => number,
  p50: number,
  p99: number,
): number => {
  if (p50 <= 0 && p99 <= 0) {
    return 0;
  }

  const roll = nextRandom();
  if (p99 > 0 && roll < 0.01) {
    return p99;
  }
  if (p50 > 0 && roll < 0.99) {
    return p50;
  }

  return 0;
};

export const createChaosMiddleware = ({ config, logger, metrics }: ChaosOptions) => {
  const nextRandom = createDeterministicRng(config.seed);

  return (req: Request, res: Response, next: NextFunction) => {
    if (!config.enabled || !matchRoute(req, config.routes)) {
      next();
      return;
    }

    const requestId = req.id;
    const errorRoll = nextRandom();

    if (errorRoll < config.errorRate) {
      const span = tracer.startSpan('chaos.inject');
      span.setAttribute('chaos.injected', true);
      span.setAttribute('chaos.type', 'error');
      span.setAttribute('http.route', req.path);
      span.end();

      metrics.chaosInjectionsTotal.inc({ type: 'error' });
      logger.warn({ request_id: requestId, route: req.path, chaos_type: 'error' }, 'Chaos injected');

      res.status(503).json({
        error: 'Injected chaos error',
        request_id: requestId,
      });
      return;
    }

    const latencyMs = resolveLatencyMs(nextRandom, config.latencyP50Ms, config.latencyP99Ms);

    if (latencyMs > 0) {
      const span = tracer.startSpan('chaos.inject');
      span.setAttribute('chaos.injected', true);
      span.setAttribute('chaos.type', 'latency');
      span.setAttribute('chaos.latency_ms', latencyMs);
      span.setAttribute('http.route', req.path);
      span.end();

      metrics.chaosInjectionsTotal.inc({ type: 'latency' });
      logger.info(
        { request_id: requestId, route: req.path, chaos_type: 'latency', latency_ms: latencyMs },
        'Chaos injected',
      );

      setTimeout(() => next(), latencyMs);
      return;
    }

    next();
  };
};
