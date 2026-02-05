# Drafty Bird Decisions

- Use a single Node.js TypeScript service to minimize deployment complexity for SRE candidates.
- Serve web assets from the same server process to avoid multi-service coordination.
- Use Canvas rendering for deterministic game state updates and simple collision logic.
- Keep leaderboard optional and resilient with SQLite-first plus in-memory fallback.
- Use Prometheus and OpenTelemetry as first-class operational interfaces.
- Make chaos engineering hooks opt-in and deterministic; safe defaults are mandatory.
- Prefer minimal, mainstream dependencies (`express`, `prom-client`, `pino`, `@opentelemetry/*`, `react`, `vite`).
- Keep CI deploy-neutral: lint, tests, docker build only; no Terraform/Kubernetes assets.
