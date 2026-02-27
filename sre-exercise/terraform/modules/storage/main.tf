variable "rg_name" { type = string }
variable "location" { type = string }
variable "env" { type = string }

resource "azurerm_storage_account" "main" {
  name                     = "stdraftybird${var.env}"
  resource_group_name      = var.rg_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

resource "azurerm_storage_share" "data" {
  name                 = "draftybird-data"
  storage_account_name = azurerm_storage_account.main.name
  quota                = 50
}

output "storage_account_name" { value = azurerm_storage_account.main.name }
output "storage_account_key" { value = azurerm_storage_account.main.primary_access_key }
output "share_name" { value = azurerm_storage_share.data.name }
