# variables.tf
variable "aws_region" {
  description = "The AWS region things are created in"
  default     = "us-east-1"
}

variable "ecr_repository_url" {
  description = "ECR Repository URL for drafty-bird image"
  type        = string
}

variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}

variable "otel_endpoint_url" {
  description = "URL for the OpenTelemetry collector"
  type        = string
  default     = ""
}

# outputs.tf
output "alb_hostname" {
  value       = aws_lb.main.dns_name
  description = "The DNS name of the load balancer"
}
