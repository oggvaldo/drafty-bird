import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAppState } from '../src/app';
import type { AppConfig } from '../src/config';

const testConfig = (overrides?: Partial<AppConfig>): AppConfig => ({
  nodeEnv: 'test',
  port: 8080,
  dbPath: '/tmp/drafty-bird-test.sqlite',
  staticDir: '/tmp/does-not-exist',
  chaos: {
    enabled: false,
    errorRate: 0,
    latencyP50Ms: 0,
    latencyP99Ms: 0,
    routes: new Set(['/score', '/leaderboard']),
    seed: 7,
  },
  ...overrides,
});

describe('server endpoints', () => {
  it('serves health, readiness, and metrics', async () => {
    const appState = await createAppState({ config: testConfig() });

    const health = await request(appState.app).get('/healthz');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');

    const ready = await request(appState.app).get('/readyz');
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe('ready');

    const metrics = await request(appState.app).get('/metrics');
    expect(metrics.status).toBe(200);
    expect(metrics.text).toContain('http_requests_total');
    expect(metrics.text).toContain('http_request_duration_seconds_bucket');
    expect(metrics.text).toContain('drafty_bird_games_started_total');
    expect(metrics.text).toContain('drafty_bird_games_completed_total');
    expect(metrics.text).toContain('drafty_bird_high_score');
    expect(metrics.text).toContain('drafty_bird_chaos_injections_total');

    await appState.store.close();
  });

  it('injects chaos error when enabled and rate is 1.0', async () => {
    const appState = await createAppState({
      config: testConfig({
        chaos: {
          enabled: true,
          errorRate: 1,
          latencyP50Ms: 0,
          latencyP99Ms: 0,
          routes: new Set(['/score']),
          seed: 99,
        },
      }),
    });

    const response = await request(appState.app).post('/score').send({ player: 'A', score: 5 });
    expect(response.status).toBe(503);

    const metrics = await request(appState.app).get('/metrics');
    expect(metrics.text).toContain('drafty_bird_chaos_injections_total{type="error"} 1');

    await appState.store.close();
  });

  it('injects chaos latency on leaderboard route', async () => {
    const appState = await createAppState({
      config: testConfig({
        chaos: {
          enabled: true,
          errorRate: 0,
          latencyP50Ms: 10,
          latencyP99Ms: 50,
          routes: new Set(['/leaderboard']),
          seed: 123,
        },
      }),
    });

    const start = Date.now();
    const response = await request(appState.app).get('/leaderboard');
    const durationMs = Date.now() - start;

    expect(response.status).toBe(200);
    expect(durationMs).toBeGreaterThanOrEqual(8);

    const metrics = await request(appState.app).get('/metrics');
    expect(metrics.text).toContain('drafty_bird_chaos_injections_total{type="latency"} 1');

    await appState.store.close();
  });
});
