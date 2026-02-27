# Observability Dashboard for Drafty Bird

*This document outlines the panels and PromQL queries that would constitute the primary Grafana/Observability dashboard for the Drafty Bird application.*

## High-Level Service Overview (The "Golden Signals")

An on-call engineer should immediately see the health of the service at the top of the dashboard.

### 1. Request Rate (Traffic)
**Query:** `sum(rate(http_requests_total[1m])) by (route, method)`
**Visualization:** Stacked Time Series Graph
**Purpose:** Shows total throughput and helps identify traffic spikes or sudden drops.

### 2. Error Rate (%)
**Query:** `sum(rate(http_requests_total{status=~"5.."}[1m])) / sum(rate(http_requests_total[1m])) * 100`
**Visualization:** Stat (Gauge) + Time Series Graph
**Purpose:** Critical indicator of service failures. Threshold > 1% turns the panel red.

### 3. P99 Latency
**Query:** `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))`
**Visualization:** Time Series Graph
**Purpose:** Shows the upper bound of user experience delay.

## Game & Application Specific Metrics

These panels provide business-value metrics specific to the app.

### 4. Game Activity Funnel
**Queries:**
- `rate(drafty_bird_games_started_total[1m])`
- `rate(drafty_bird_games_completed_total[1m])`
**Visualization:** Two lines on a single Time Series graph.
**Purpose:** If the gap between starts and completions gets too wide, or if both drop to zero while traffic is normal, the game logic or client is broken.

### 5. High Score Tracking
**Query:** `drafty_bird_high_score`
**Visualization:** Stat
**Purpose:** Fun business metric.

## Chaos & Diagnostics

To quickly debug incidents.

### 6. Chaos Injections Rate
**Query:** `rate(drafty_bird_chaos_injections_total[1m]) by (type)`
**Visualization:** Bar Gauge or Time Series
**Purpose:** Correlate latency spikes or error rates directly to active Chaos Engineering tests.

### 7. Instance Health
**Query:** `up{job="drafty-bird"}`
**Visualization:** Stat (0=Down, 1=Up)
**Purpose:** Is the scrape target actually reachable?

---
## On-Call Runbook: "What to look at first"

When an alert fires (e.g., `DraftyBirdHighErrorRate`):
1. **Check the Dashboard Error and Latency panels**. Do the errors correlate with a specific `route` (e.g., `/score`)?
2. **Check the Chaos Injection panel**. Is chaos currently running? If yes, and it is staging, the alert might be expected. If it's production, disable chaos (`CHAOS_ENABLED=false`).
3. **Open the Traces (Jaeger/Honeycomb/X-Ray)**.
   - Filter spans where `error=true`.
   - Check if the errors have the span attribute `chaos.injected=true`.
   - Look at the `request_id` attached to the trace to locate the exact error in the JSON logs.
4. **Determine Rollback**. If the error rate persists and is tied to a recent deployment (Check ECS deployment history), execute a rollback in AWS CodeDeploy.
