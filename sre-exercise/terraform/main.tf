provider "aws" {
  region = var.aws_region
}

module "networking" {
  source = "./modules/networking"
}

module "efs" {
  source     = "./modules/efs"
  subnet_ids = module.networking.subnet_ids
  efs_sg_id  = module.networking.efs_sg_id
}

module "alb" {
  source     = "./modules/alb"
  vpc_id     = module.networking.vpc_id
  subnet_ids = module.networking.subnet_ids
  alb_sg_id  = module.networking.alb_sg_id
}

module "ecs" {
  source             = "./modules/ecs"
  aws_region         = var.aws_region
  ecr_repository_url = var.ecr_repository_url
  image_tag          = var.image_tag
  otel_endpoint_url  = var.otel_endpoint_url
  file_system_id     = module.efs.file_system_id
  subnet_ids         = module.networking.subnet_ids
  ecs_tasks_sg_id    = module.networking.ecs_tasks_sg_id
  target_group_arn   = module.alb.target_group_arn
}
