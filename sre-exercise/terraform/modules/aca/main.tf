variable "rg_name" { type = string }
variable "location" { type = string }
variable "env" { type = string }
variable "subnet_id" { type = string }
variable "storage_account_name" { type = string }
variable "storage_account_key" { type = string }
variable "share_name" { type = string }
variable "container_image" { type = string }
variable "container_port" { type = number }
variable "otel_endpoint_url" { type = string }

resource "azurerm_log_analytics_workspace" "main" {
  name                = "law-draftybird-${var.env}"
  location            = var.location
  resource_group_name = var.rg_name
  sku                 = "PerGB2018"
}

resource "azurerm_container_app_environment" "main" {
  name                           = "cae-draftybird-${var.env}"
  location                       = var.location
  resource_group_name            = var.rg_name
  log_analytics_workspace_id     = azurerm_log_analytics_workspace.main.id
  infrastructure_subnet_id       = var.subnet_id
  internal_load_balancer_enabled = true # Security: Do not expose Environment directly to internet
}

resource "azurerm_container_app_environment_storage" "main" {
  name                         = "caestoragedraftybird"
  container_app_environment_id = azurerm_container_app_environment.main.id
  account_name                 = var.storage_account_name
  share_name                   = var.share_name
  access_key                   = var.storage_account_key
  access_mode                  = "ReadWrite"
}

resource "azurerm_container_app" "app" {
  name                         = "ca-draftybird-${var.env}"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = var.rg_name
  revision_mode                = "Single"

  template {
    min_replicas = 1
    max_replicas = 1 # Force 1 replica to protect SQLite DB locking on Azure Files

    container {
      name   = "drafty-bird"
      image  = var.container_image
      cpu    = 0.5
      memory = "1.0Gi"

      env {
        name  = "SCORE_DB_PATH"
        value = "/data/db.sqlite"
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "OTEL_EXPORTER_OTLP_ENDPOINT"
        value = var.otel_endpoint_url
      }

      volume_mounts {
        name = "data-volume"
        path = "/data"
      }
    }

    volume {
      name         = "data-volume"
      storage_type = "AzureFile"
      storage_name = azurerm_container_app_environment_storage.main.name
    }
  }

  ingress {
    allow_insecure_connections = false
    external_enabled           = true
    target_port                = var.container_port
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }
}

output "fqdn" { value = azurerm_container_app.app.latest_revision_fqdn }
