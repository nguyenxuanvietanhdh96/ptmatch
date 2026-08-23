include "root" {
  path = find_in_parent_folders()
}

locals {
  env = read_terragrunt_config(find_in_parent_folders("env.hcl"))
}

terraform {
  source = "../../../modules/cdn"
}

dependency "storage" {
  config_path = "../storage"

  mock_outputs = {
    media_bucket_name = "ptmatch-media-mock"
  }
  mock_outputs_allowed_terraform_commands = ["init", "validate", "plan"]
}

inputs = {
  media_bucket_name = dependency.storage.outputs.media_bucket_name
  cdn_domain        = local.env.locals.cdn_domain
}
