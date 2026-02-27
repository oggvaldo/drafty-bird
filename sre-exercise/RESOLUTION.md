# Drafty Bird: Architectural Decisions & Trade-offs

This document (ADR - Architecture Decision Record) explains the reasoning behind the deployment architecture, tooling, and operational choices made for the Drafty Bird service. It is intended to help engineers (especially those onboarding or reviewing the setup) understand *why* we built it this way, and what trade-offs we accepted.

---

## 1. Compute Choice: AWS ECS with Fargate

**Decision:** Run the Drafty Bird Docker container on AWS Elastic Container Service (ECS) using the Fargate launch type.

**Reasoning:**
- **Serverless Operations:** Fargate removes the need to patch, maintain, or auto-scale underlying EC2 instances. This significantly reduces the operational burden on the SRE team.
- **Cost vs. Reliability:** While Fargate is slightly more expensive per compute-hour than reserved EC2 instances, the cost is offset by the lack of maintenance time. It meets the prompt's requirement where "cost matters, but reliability matters more."
- **Simplicity:** The application is a single Docker container. ECS is perfectly suited for orchestrating simple, stateless (or single-volume) container workloads compared to the overhead of managing a full Kubernetes (EKS) cluster.

**Trade-offs:**
- Slower container startup times compared to warm EC2 instances, which marginally impacts auto-scaling responsiveness during sudden traffic spikes.

---

## 2. Storage Choice: AWS EFS (Elastic File System) for SQLite

**Decision:** Mount an AWS EFS volume to the Fargate container to store the `db.sqlite` file.

**Reasoning:**
- The application relies on SQLite for persistent leaderboard storage. Containers are ephemeral; without an external volume, all high scores would be lost whenever the container restarts or a new deployment occurs.
- EFS can be easily mounted to ECS Fargate tasks, providing durable, POSIX-compliant file storage that survives task lifecycle events.

**Trade-offs:**
- **The Concurrency Bottleneck:** SQLite uses file-level locking for writes. EFS is a network file system (NFS). If we scaled the application to run *multiple* Fargate tasks simultaneously, they would all try to grab write locks on the same NFS-mounted `db.sqlite` file, leading to high latency, `SQLITE_BUSY` errors, and potential database corruption.

---

## 3. High Availability vs. Data Integrity (The Single Task Decision)

**Decision:** Run exactly **one (1)** replica of the ECS task (`desired_count = 1`).

**Reasoning:**
- Because of the SQLite + EFS concurrency trade-off mentioned above, we must constrain the application to a single writer. 
- While running a single instance violates traditional High Availability (HA) principles (if the container crashes, there will be brief downtime while ECS spins up a replacement), data integrity for the leaderboard is guaranteed.

**Trade-offs / Future Work:**
- We trade immediate fault tolerance for data consistency. 
- **The Fix:** To achieve true HA (running 2+ containers behind the ALB), we *must* migrate the application off SQLite and onto a concurrent, network-accessible database like PostgreSQL (e.g., AWS RDS).

---

## 4. Observability Tooling (Prometheus & OpenTelemetry)

**Decision:** Standardize on the provided `/metrics` endpoint for Prometheus scraping and utilize OpenTelemetry (`OTEL_EXPORTER_OTLP_ENDPOINT`) for distributed tracing.

**Reasoning:**
- The application already exposes these standards, avoiding the need for proprietary agents inside the container.
- **Traces > Logs for Chaos:** Because the app includes chaos engineering functionality (`chaos.injected=true`), tracing is critical. When P99 latency spikes, an engineer can query the OpenTelemetry backend (e.g., Jaeger or AWS X-Ray) to immediately see if the latency was naturally occurring or injected by the chaos engine, saving valuable debugging time.

**Trade-offs:**
- Requires managing a Prometheus server and an OTLP collector infrastructure, introducing external dependencies to the monitoring stack.

---

## 5. Rollout Strategy: Blue/Green Deployments

**Decision:** Use AWS CodeDeploy for ECS to perform Blue/Green deployments.

**Reasoning:**
- The `readyz` endpoint ensures the new (Green) container is fully booted and connected to the EFS volume *before* any production traffic is shifted to it.
- If the Green deployment fails its health checks, the ALB never routes traffic to it, and CodeDeploy safely aborts, leaving the Blue environment intact.

**Trade-offs:**
---

## 6. Infrastructure-as-Code: Modularization

**Decision:** Define the AWS infrastructure using logical Terraform modules (`networking`, `efs`, `alb`, and `ecs`) rather than a monolithic `main.tf` file.

**Reasoning:**
- **Future Scalability:** Breaking the infrastructure into modules makes it much easier to deploy additional services into the same cluster. Instead of copying large blocks of resource definitions, future services can simply invoke the `ecs` module or reuse the existing `alb` and `networking` module outputs.
- **Separation of Concerns:** Networking (VPCs, Security Groups) changes at a different frequency and often requires different permissions than application compute (ECS Tasks). Modularizing them explicitly defines dependencies and interfaces (via `variables.tf` and `outputs.tf`).

**Trade-offs:**
- **Initial Overhead:** Creating the directory structure, variables, outputs, and wiring modules together takes longer initially than throwing all resources into a single file.
- **Complexity in Navigation:** Engineers must trace variable passing between modules (e.g., passing `module.networking.subnet_ids` into `module.ecs.subnet_ids`) rather than reading a flat configuration. However, this trade-off is widely accepted as best practice for maintainable IaC.
