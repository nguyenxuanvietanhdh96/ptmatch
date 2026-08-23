include "root" {
  path = find_in_parent_folders()
}

locals {
  env = read_terragrunt_config(find_in_parent_folders("env.hcl"))
}

terraform {
  source = "../../../modules/dns"
}

dependency "compute" {
  config_path = "../compute"

  mock_outputs = {
    external_ip = "203.0.113.10"
  }
  mock_outputs_allowed_terraform_commands = ["init", "validate", "plan"]
}

dependency "cdn" {
  config_path = "../cdn"

  mock_outputs = {
    cdn_ip = "203.0.113.20"
  }
  mock_outputs_allowed_terraform_commands = ["init", "validate", "plan"]
}

inputs = {
  create_zone = local.env.locals.create_dns_zone
  domain      = local.env.locals.dns_zone_domain
  gce_ip      = dependency.compute.outputs.external_ip
  cdn_ip      = dependency.cdn.outputs.cdn_ip
}
