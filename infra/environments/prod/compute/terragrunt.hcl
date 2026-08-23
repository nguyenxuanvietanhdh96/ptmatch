include "root" {
  path = find_in_parent_folders()
}

locals {
  env = read_terragrunt_config(find_in_parent_folders("env.hcl"))
}

terraform {
  source = "../../../modules/compute"
}

dependency "network" {
  config_path = "../network"

  mock_outputs = {
    subnet_self_link = "projects/mock-project/regions/asia-southeast1/subnetworks/mock-subnet"
    web_tag          = "ptmatch-mock-web"
  }
  mock_outputs_allowed_terraform_commands = ["init", "validate", "plan"]
}

dependency "storage" {
  config_path = "../storage"

  mock_outputs = {
    media_bucket_name = "ptmatch-media-mock"
  }
  mock_outputs_allowed_terraform_commands = ["init", "validate", "plan"]
}

inputs = {
  machine_type     = local.env.locals.machine_type
  subnet_self_link = dependency.network.outputs.subnet_self_link
  web_tag          = dependency.network.outputs.web_tag
  media_bucket     = dependency.storage.outputs.media_bucket_name
}
