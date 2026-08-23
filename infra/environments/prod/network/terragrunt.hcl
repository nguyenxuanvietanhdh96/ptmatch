include "root" {
  path = find_in_parent_folders()
}

locals {
  env = read_terragrunt_config(find_in_parent_folders("env.hcl"))
}

terraform {
  source = "../../../modules/network"
}

inputs = {
  ssh_allowed_cidrs = local.env.locals.ssh_allowed_cidrs
}
