resource "aws_efs_file_system" "drafty_bird_data" {
  creation_token   = "drafty-bird-data"
  performance_mode = "generalPurpose"
  encrypted        = true
  tags = {
    Name = "DraftyBirdData"
  }
}

resource "aws_efs_mount_target" "drafty_bird_mounts" {
  for_each        = toset(var.subnet_ids)
  file_system_id  = aws_efs_file_system.drafty_bird_data.id
  subnet_id       = each.value
  security_groups = [var.efs_sg_id]
}
