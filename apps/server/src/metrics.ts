import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export interface AppMetrics {
  registry: Registry;
  httpRequestsTotal: Counter<'route' | 'method' | 'status'>;
  httpRequestDuration: Histogram<'route' | 'method' | 'status'>;
  gamesStartedTotal: Counter;
  gamesCompletedTotal: Counter;
  highScoreGauge: Gauge;
  chaosInjectionsTotal: Counter<'type'>;
}

export const createMetrics = (): AppMetrics => {
  const registry = new Registry();

  const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Count of HTTP requests by route/method/status',
    labelNames: ['route', 'method', 'status'],
    registers: [registry],
  });

  const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['route', 'method', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
    registers: [registry],
  });

  const gamesStartedTotal = new Counter({
    name: 'drafty_bird_games_started_total',
    help: 'Total number of Drafty Bird games started',
    registers: [registry],
  });

  const gamesCompletedTotal = new Counter({
    name: 'drafty_bird_games_completed_total',
    help: 'Total number of Drafty Bird games completed',
    registers: [registry],
  });

  const highScoreGauge = new Gauge({
    name: 'drafty_bird_high_score',
    help: 'Highest score submitted to the backend',
    registers: [registry],
  });

  const chaosInjectionsTotal = new Counter({
    name: 'drafty_bird_chaos_injections_total',
    help: 'Total chaos injections by type',
    labelNames: ['type'],
    registers: [registry],
  });

  return {
    registry,
    httpRequestsTotal,
    httpRequestDuration,
    gamesStartedTotal,
    gamesCompletedTotal,
    highScoreGauge,
    chaosInjectionsTotal,
  };
};
