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
      file_system_id     = var.file_system_id
      transit_encryption = "ENABLED"
    }
  }
}

resource "aws_ecs_service" "app" {
  name            = "drafty-bird-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 1 # 1 replica to avoid SQLite concurrent write locks on EFS
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [var.ecs_tasks_sg_id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "drafty-bird"
    container_port   = 8080
  }
}

resource "aws_iam_role" "ecs_task_role" {
  name               = "drafty-bird-ecs-task-role"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Action = "sts:AssumeRole", Principal = { Service = "ecs-tasks.amazonaws.com" }, Effect = "Allow" }] })
}
resource "aws_iam_role" "ecs_execution_role" {
  name               = "drafty-bird-ecs-execution-role"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Action = "sts:AssumeRole", Principal = { Service = "ecs-tasks.amazonaws.com" }, Effect = "Allow" }] })
}
