# Drafty Bird: Architectural Decisions & Trade-offs (Azure)

This ADR explains the reasoning behind the deployment architecture, tooling, and operational choices made for deploying Drafty Bird to Microsoft Azure.

---

## 1. Compute Choice: Azure Container Apps (ACA)

**Decision:** Run the Drafty Bird Docker container on Azure Container Apps.

**Reasoning:**
- **Serverless Operations:** ACA provides Kubernetes-based container orchestration without requiring the team to manage a full Azure Kubernetes Service (AKS) cluster. It abstracts the control plane, patching, and OS maintenance.
- **Cost vs. Reliability:** ACA scales to zero (if desired) and charges per second of execution. It is highly reliable and integrates natively with Envoy ingress.
- **Simplicity:** For a single Docker container, the overhead of standard AKS or even bare VMs is unnecessary.

**Trade-offs:**
- Slower "cold starts" if scaled to zero compared to keeping an Always-On App Service instance running, though we keep `min_replicas = 1` for consistent latency.

---

## 2. Storage Choice: Azure Files for SQLite

**Decision:** Mount an Azure Files share to the ACA container to store `db.sqlite`.

**Reasoning:**
- The application relies on SQLite. Containers are ephemeral; high scores would be lost on restarts.
- Azure Files leverages the SMB protocol to mount durable, network-attached persistent storage directly into the ACA environment.

**Trade-offs:**
- **The Concurrency Bottleneck:** SQLite uses file-level locking. Azure Files introduces network latency. If multiple containers wrote simultaneously via SMB, they would encounter `SQLITE_BUSY` errors and potential DB locking/corruption.

---

## 3. High Availability vs. Data Integrity (The Single Replica Constraint)

**Decision:** Run exactly **one (1)** max replica of the Container App (`max_replicas = 1`).

**Reasoning:**
- Because of the SQLite + Azure Files concurrency limitation, we must constrain the application to a single writer. 
- While running a single instance violates traditional High Availability (HA) principles, data integrity is strictly maintained.

**Trade-offs / Future Work:**
- We trade immediate fault tolerance for data consistency. 
- **The Fix:** To achieve HA, we must migrate off SQLite and onto Azure Database for PostgreSQL.

---

## 4. CI/CD & Deployments: Azure DevOps

**Decision:** Utilize Azure Pipelines (`azure-pipelines.yml`) to orchestrate container builds and deployments.

**Reasoning:**
- The prompt requested an Azure DevOps or GitHub Actions equivalent to CodeDeploy. Azure DevOps offers deep enterprise integration, robust YAML pipelines, and native tasks (`AzureCLI@2`) for seamlessly pushing to Azure Container Registry (ACR) and triggering ACA updates.
- **Revisions:** ACA inherently manages "Revisions" on every image update. We can rapidly rollback traffic using native Revision weights if the new code fails.

**Trade-offs:**
- Requires maintaining Service Connections and pipeline YAML alongside application code.

---

## 5. Infrastructure-as-Code: Terraform Modules

**Decision:** Define the Azure infrastructure using modularized Terraform (`networking`, `storage`, `aca`).

**Reasoning:**
- **Future Scalability:** By decoupling VNet creation (`networking`) from app hosting (`aca`), future microservices can be deployed into the same network without redefining network architecture. The `storage` module handles the Azure File share independently.

**Trade-offs:**
- Initial setup complexity is higher than writing a monolithic `main.tf`, but the long-term maintainability for the SRE team pays off immediately when scaling.
