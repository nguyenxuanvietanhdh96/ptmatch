include "root" {
  path = find_in_parent_folders()
}

locals {
  env = read_terragrunt_config(find_in_parent_folders("env.hcl"))
}

terraform {
  source = "../../../modules/storage"
}

inputs = {
  cors_origins = local.env.locals.cors_origins

  # Cho phép destroy bucket còn object ở dev, chặn ở prod
  force_destroy = local.env.locals.environment == "dev"
}
