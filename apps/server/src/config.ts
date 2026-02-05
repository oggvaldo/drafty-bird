import path from 'node:path';

export interface ChaosConfig {
  enabled: boolean;
  errorRate: number;
  latencyP50Ms: number;
  latencyP99Ms: number;
  routes: Set<string>;
  seed: number;
}

export interface AppConfig {
  nodeEnv: string;
  port: number;
  dbPath: string;
  staticDir: string;
  chaos: ChaosConfig;
  otelEndpoint?: string;
}

const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
};

const parseBool = (value: string | undefined, fallback = false): boolean => {
  if (!value) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const loadConfig = (): AppConfig => {
  const port = Math.floor(clamp(parseNumber(process.env.PORT, 8080), 1, 65535));

  const routeList = (process.env.CHAOS_ROUTES ?? '/score,/leaderboard')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const config: AppConfig = {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port,
    dbPath: process.env.SCORE_DB_PATH ?? '/data/db.sqlite',
    staticDir:
      process.env.WEB_DIST_DIR ?? path.resolve(process.cwd(), 'apps/web/dist'),
    chaos: {
      enabled: parseBool(process.env.CHAOS_ENABLED, false),
      errorRate: clamp(parseNumber(process.env.CHAOS_ERROR_RATE, 0), 0, 1),
      latencyP50Ms: clamp(parseNumber(process.env.CHAOS_LATENCY_MS_P50, 0), 0, 60_000),
      latencyP99Ms: clamp(parseNumber(process.env.CHAOS_LATENCY_MS_P99, 0), 0, 60_000),
      routes: new Set(routeList),
      seed: Math.floor(clamp(parseNumber(process.env.CHAOS_SEED, 42), 1, 2_147_483_647)),
    },
  };

  const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (otelEndpoint && otelEndpoint.length > 0) {
    config.otelEndpoint = otelEndpoint;
  }

  return config;
};
