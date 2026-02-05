# Drafty Bird Plan

## Goals
- Deliver a stable, deploy-neutral sample app for SRE exercises.
- Keep app behavior deterministic and testable.
- Expose strong operational interfaces (health, readiness, metrics, tracing, logs, chaos hooks).

## Architecture

```text
+-------------------------- Single Node.js Container --------------------------+
|                                                                              |
|  Express API + Static Host                                                   |
|    - /healthz, /readyz                                                       |
|    - /metrics (Prometheus)                                                   |
|    - /score, /leaderboard                                                    |
|    - chaos middleware (opt-in)                                               |
|    - structured JSON logs + request_id                                       |
|    - OpenTelemetry (HTTP + custom spans)                                     |
|                                                                              |
|  Storage Abstraction                                                         |
|    - SQLiteStore (if available/configured)                                   |
|    - MemoryStore fallback                                                    |
|                                                                              |
|  Static Assets                                                               |
|    - Vite-built React app (Canvas game)                                      |
+------------------------------------------------------------------------------+

Browser
  -> GET / (loads game)
  -> Optional POST /score
  -> GET /leaderboard
```

## Endpoints
- `GET /healthz`: process liveness, returns `200` + `{ "status": "ok" }`.
- `GET /readyz`: readiness from storage init state, `200` when ready, otherwise `503`.
- `GET /metrics`: Prometheus text metrics.
- `POST /score`: accepts `{ player?: string, score: number }`, stores run score, returns stored score + high score.
- `GET /leaderboard`: returns top 10 all-time scores.

## Data Model
Leaderboard row:
- `id`: integer primary key (SQLite only)
- `player`: string (default `Guest`)
- `score`: integer (`>=0`)
- `created_at`: ISO timestamp

Top 10 ordering:
1. Score descending
2. Created time ascending (stable for ties)

## Metrics
HTTP metrics:
- `http_requests_total{route,method,status}`
- `http_request_duration_seconds_bucket{route,method,status,le}`

Game + app metrics:
- `drafty_bird_games_started_total`
- `drafty_bird_games_completed_total`
- `drafty_bird_high_score`
- `drafty_bird_chaos_injections_total{type}`

## Logging
- Structured JSON logs via `pino` to stdout.
- Per-request `request_id` correlation.
- Reduced noise by downgrading health/metrics request logs to debug.

## Tracing
OpenTelemetry backend instrumentation:
- Auto-instrument HTTP server spans.
- Custom spans:
  - `score.submit`
  - `leaderboard.query`
  - `chaos.inject`

Exporter behavior:
- If `OTEL_EXPORTER_OTLP_ENDPOINT` set: OTLP HTTP exporter.
- Else (non-test/dev): console exporter for local visibility.

## Chaos Design
Disabled by default.

Env controls:
- `CHAOS_ENABLED` (`false` default)
- `CHAOS_ERROR_RATE` (`0.0` to `1.0`)
- `CHAOS_LATENCY_MS_P50`
- `CHAOS_LATENCY_MS_P99`
- `CHAOS_ROUTES` (defaults `/score,/leaderboard`)

Behavior when enabled:
- Deterministic PRNG (seeded) to decide injection outcomes.
- Error injection: probabilistic `503`.
- Latency injection: probabilistic delays around configured p50/p99 values.
- On injection:
  - increment `drafty_bird_chaos_injections_total{type}`
  - emit structured log event
  - set span attrs (`chaos.injected=true`, `chaos.type=*`)

## Build/Test Plan
- Root npm scripts orchestrate lint, test, build.
- Web tests: deterministic game logic + mount smoke test.
- Server tests: health/ready/metrics + chaos behavior.
- Docker multi-stage build outputs single runtime container.
- GitHub Actions runs lint, tests, and docker build.
