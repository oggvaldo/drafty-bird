provider "azurerm" {
  features {}
}

module "networking" {
  source   = "./modules/networking"
  env      = var.env
  location = var.location
}

module "storage" {
  source   = "./modules/storage"
  env      = var.env
  location = var.location
  rg_name  = module.networking.rg_name
}

module "aca" {
  source               = "./modules/aca"
  env                  = var.env
  location             = var.location
  rg_name              = module.networking.rg_name
  subnet_id            = module.networking.subnet_id
  storage_account_name = module.storage.storage_account_name
  storage_account_key  = module.storage.storage_account_key
  share_name           = module.storage.share_name
  container_image      = var.container_image
  container_port       = var.container_port
  otel_endpoint_url    = var.otel_endpoint_url
}
