variable "location" {
  description = "The Azure region to deploy to"
  default     = "eastus"
}

variable "env" {
  description = "Environment name e.g. prod"
  default     = "prod"
}

variable "container_image" {
  description = "Container image to deploy"
  type        = string
}

variable "container_port" {
  description = "Container port"
  type        = number
  default     = 8080
}

variable "otel_endpoint_url" {
  description = "URL for OpenTelemetry OTLP tracing Collector"
  default     = ""
}
