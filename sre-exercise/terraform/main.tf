provider "aws" {
  region = var.aws_region
}

# VPC and Networking (Simplified assumes default VPC or pre-existing)
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# ----------------------------------------------------
# EFS for SQLite Persistent Storage
# ----------------------------------------------------
resource "aws_efs_file_system" "drafty_bird_data" {
  creation_token   = "drafty-bird-data"
  performance_mode = "generalPurpose"
  encrypted        = true
  tags = {
    Name = "DraftyBirdData"
  }
}

resource "aws_efs_mount_target" "drafty_bird_mounts" {
  for_each        = toset(data.aws_subnets.default.ids)
  file_system_id  = aws_efs_file_system.drafty_bird_data.id
  subnet_id       = each.value
  security_groups = [aws_security_group.efs.id]
}

# ----------------------------------------------------
# ECS Cluster & Task Definition
# ----------------------------------------------------
resource "aws_ecs_cluster" "main" {
  name = "drafty-bird-cluster"
}

resource "aws_ecs_task_definition" "app" {
  family                   = "drafty-bird-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([{
    name      = "drafty-bird"
    image     = "${var.ecr_repository_url}:${var.image_tag}"
    essential = true
    portMappings = [{
      containerPort = 8080
      hostPort      = 8080
      protocol      = "tcp"
    }]
    environment = [
      { name = "SCORE_DB_PATH", value = "/data/db.sqlite" },
      { name = "NODE_ENV", value = "production" },
      { name = "OTEL_EXPORTER_OTLP_ENDPOINT", value = var.otel_endpoint_url }
    ]
    mountPoints = [{
      sourceVolume  = "efs-data"
      containerPath = "/data"
    }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/drafty-bird"
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])

  volume {
    name = "efs-data"
    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.drafty_bird_data.id
      transit_encryption = "ENABLED"
    }
  }
}

# ----------------------------------------------------
# ECS Service
# ----------------------------------------------------
resource "aws_ecs_service" "app" {
  name            = "drafty-bird-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 1 # 1 replica to avoid SQLite concurrent write locks on EFS
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "drafty-bird"
    containerPort    = 8080
  }

  depends_on = [aws_lb_listener.front_end]
}

# ----------------------------------------------------
# Load Balancer
# ----------------------------------------------------
resource "aws_lb" "main" {
  name               = "drafty-bird-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnets.default.ids
}

resource "aws_lb_target_group" "app" {
  name        = "drafty-bird-tg"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.default.id
  target_type = "ip"

  health_check {
    healthy_threshold   = "3"
    interval            = "30"
    protocol            = "HTTP"
    matcher             = "200"
    timeout             = "3"
    path                = "/healthz"
    unhealthy_threshold = "2"
  }
}

resource "aws_lb_listener" "front_end" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80" # Should be 443 with ACM cert in a real deployment
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# ----------------------------------------------------
# Base Security Groups & IAM (placeholders)
# ----------------------------------------------------
resource "aws_security_group" "alb" {
  name        = "drafty-bird-alb-sg"
  description = "controls access to the ALB"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    protocol    = "tcp"
    from_port   = 80
    to_port     = 80
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs_tasks" {
  name        = "drafty-bird-ecs-tasks-sg"
  description = "allow inbound access from the ALB only"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    protocol        = "tcp"
    from_port       = 8080
    to_port         = 8080
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "efs" {
  name        = "drafty-bird-efs-sg"
  description = "Allow inbound NFS traffic from ECS"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    protocol        = "tcp"
    from_port       = 2049
    to_port         = 2049
    security_groups = [aws_security_group.ecs_tasks.id]
  }
}

# IAM Policies omitted for brevity. You need roles for execution and task.
resource "aws_iam_role" "ecs_task_role" {
  name               = "drafty-bird-ecs-task-role"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Action = "sts:AssumeRole", Principal = { Service = "ecs-tasks.amazonaws.com" }, Effect = "Allow" }] })
}
resource "aws_iam_role" "ecs_execution_role" {
  name               = "drafty-bird-ecs-execution-role"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Action = "sts:AssumeRole", Principal = { Service = "ecs-tasks.amazonaws.com" }, Effect = "Allow" }] })
}
