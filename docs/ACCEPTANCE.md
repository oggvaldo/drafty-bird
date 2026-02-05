# Acceptance Checklist

- [x] `npm install` works cleanly.
- [x] `npm test` passes.
- [x] `npm run build` succeeds.
- [x] `docker build -f docker/Dockerfile -t drafty-bird:local .` succeeds.
- [x] `docker run -p 8080:8080 drafty-bird:local` serves the game.
- [x] `curl http://localhost:8080/healthz` returns `200`.
- [x] `curl http://localhost:8080/readyz` returns `200`.
- [x] `curl http://localhost:8080/metrics` includes required metrics.
- [x] tracing switches to OTLP HTTP exporter when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
- [x] chaos is inert by default and injects when enabled.
