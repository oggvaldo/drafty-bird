variable "aws_region" { type = string }
variable "ecr_repository_url" { type = string }
variable "image_tag" { type = string }
variable "otel_endpoint_url" { type = string }
variable "file_system_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "ecs_tasks_sg_id" { type = string }
variable "target_group_arn" { type = string }
