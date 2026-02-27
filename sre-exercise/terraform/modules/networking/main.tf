variable "env" { type = string }
variable "location" { type = string }

resource "azurerm_resource_group" "main" {
  name     = "rg-drafty-bird-${var.env}"
  location = var.location
}

resource "azurerm_virtual_network" "main" {
  name                = "vnet-drafty-bird-${var.env}"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
}

resource "azurerm_subnet" "aca" {
  name                 = "snet-aca-${var.env}"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.2.0/23"]

  delegation {
    name = "aca-delegation"
    service_delegation {
      name    = "Microsoft.App/environments"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

output "rg_name" { value = azurerm_resource_group.main.name }
output "location" { value = azurerm_resource_group.main.location }
output "subnet_id" { value = azurerm_subnet.aca.id }
