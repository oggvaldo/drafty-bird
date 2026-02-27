# Drafty Bird: Architectural Decisions & Trade-offs (Azure)

This ADR (Architecture Decision Record) expands on the reasoning behind migrating the deployment architecture, tooling, and operational choices for deploying Drafty Bird from AWS to Microsoft Azure. It aims to explain *why* these decisions were made, particularly focusing on reliability, security, and scalability trade-offs.

---

## 1. Compute Choice: Azure Container Apps (ACA) vs. AKS

**Decision:** Migrate the Drafty Bird Docker workload to **Azure Container Apps (ACA)** instead of Azure Kubernetes Service (AKS) or Azure App Service.

**Reasoning:**
- **Serverless Paradigm (Like Fargate):** Similar to AWS Fargate, ACA abstracts the underlying node management (OS patching, VM scaling). It offers a serverless compute model specifically designed for containerized microservices.
- **Native KEDA and Envoy:** ACA natively embeds KEDA (Kubernetes Event-driven Autoscaling) and Envoy. While KEDA isn't strictly necessary for a single-container SQLite app, it provides a seamless upgrade path to scale based on HTTP queues or Prometheus metrics if the datastore changes in the future.
- **Operational Burden:** The prompt stipulates "moderate traffic" and "reliability matters more." The operational overhead of maintaining an AKS cluster (upgrading node pools, managing ingress controllers) for a single container is significant. ACA provides Kubernetes-level features without cluster management.

**Trade-offs vs. AKS:**
- **Less Control:** We cannot install custom DaemonSets (e.g., custom security agents like Falco) at the node level because we don't own the nodes.
- **Cold Starts:** If the application scales to 0, the first request will experience measurable latency (cold start). *Mitigation: We enforce `min_replicas = 1`.*

---

## 2. Storage Choice: Azure Files vs. Blob Storage for SQLite

**Decision:** Mount an **Azure Files** share via SMB into the ACA environment to store `db.sqlite`.

**Reasoning:**
- **Persistence Necessity:** Containers are ephemeral. If the ECS/ACA task crashes, the leaderboard data is wiped. We need POSIX-compliant file storage.
- **Why not Blob Storage?** SQLite expects standard file system block semantics (locking, seeks). Azure Blob Storage does not support these POSIX operations directly (without complex FUSE mounting which impacts performance). Azure Files provides an SMB mount that behaves identically to a local hard drive from the container's perspective.

**Trade-offs / Limitations:**
- **The Concurrency Bottleneck:** Network-attached storage (SMB) introduces latency for every SQLite I/O operation compared to local disk. Furthermore, SQLite uses lock files. If multiple containers attempt to write simultaneously across an SMB share, they will encounter `SQLITE_BUSY` errors and massive performance degradation.

---

## 3. High Availability vs. Data Integrity (The Single Replica Constraint)

**Decision:** Restrict the Container App to run exactly **one (1) max replica** (`max_replicas = 1`).

**Reasoning:**
- **Protecting the DB:** Because of the SQLite + Azure Files file-locking limitation, we must strictly enforce a "Single Writer" topology. Allowing ACA to auto-scale out would immediately corrupt or block the SQLite database.
- **Security:** We deployed the ACA environment using `internal_load_balancer_enabled = true`. This prevents the container instances themselves from being targeted dynamically over the public internet, routing exclusively through the controlled Ingress layer.

**Trade-offs:**
- **Violating True HA:** By limiting to one replica, we accept that an application crash or underlying node failure will result in brief downtime while ACA reschedules the container.
- **Future Re-architecture:** To achieve true horizontal scaling and Zero Downtime Deployments without locking issues, the application code *must* be reconfigured to depend on a concurrent database engine like Azure Database for PostgreSQL.

---

## 4. CI/CD & Security: Azure DevOps

**Decision:** Utilize **Azure DevOps Pipelines**, replacing the conceptual CodeDeploy model.

**Reasoning:**
- **Revision-based Rollouts:** ACA automatically creates immutable "Revisions" on every image update. Azure DevOps seamlessly drives this by pushing to Azure Container Registry (ACR) and running the `az containerapp update` task. 
- **Traffic Splitting (Blue/Green):** ACA inherently supports shifting traffic weights between revisions (e.g., 90% stable / 10% new). This is functionally superior and cheaper than AWS CodeDeploy's model of spinning up duplicate full-scale ASG task sets.

**Security Hardening (Terraform Implementation):**
To ensure the infrastructure is secure by default, the Terraform code applies multiple baseline security controls:
1. **Enforced HTTPS Pipeline:** The Storage Account (Azure Files) explicitly rejects HTTP traffic (`enable_https_traffic_only = true`).
2. **Modern TLS Required:** TLS 1.0/1.1 are deprecated. The storage account strictly enforces `min_tls_version = "TLS1_2"`.
3. **Private Network Access:** The Storage account enforces `public_network_access_enabled = false` to prevent direct internet access to the file share.

---

## 5. Infrastructure-as-Code: Terraform Modularization

**Decision:** Define the Azure infrastructure using composed Terraform modules (`networking`, `storage`, `aca`).

**Reasoning:**
- **Blast Radius and Scalability:** If a new microservice is added (e.g., a dedicated Score Processing API), it can utilize the existing `networking` module outputs without risk of destroying or mutating the core Virtual Network.
- **Security Scoping:** Network security rules (NSGs) can be managed independently of application compute, allowing for strict separation of duties between Network Admins and App Developers.

**Trade-offs:**
- **Complexity:** Navigating module variables and state outputs requires deeper Terraform knowledge. We offset this by keeping standard outputs clear and descriptive in root `outputs.tf`.
