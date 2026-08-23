# ---------------------------------------------------------------------------
# Root Terragrunt config — PTMatch
#
# project_id / region / zone được đọc từ env.hcl của từng environment
# (infra/environments/{dev,prod}/env.hcl), KHÔNG hardcode ở đây.
# ---------------------------------------------------------------------------

locals {
  # Tìm env.hcl gần nhất phía trên thư mục module đang chạy
  # (vd: environments/dev/network -> environments/dev/env.hcl)
  env_vars = read_terragrunt_config(find_in_parent_folders("env.hcl"))

  project_id  = local.env_vars.locals.project_id
  region      = local.env_vars.locals.region
  zone        = local.env_vars.locals.zone
  environment = local.env_vars.locals.environment
}

# Remote state trên GCS — bucket tạo thủ công 1 lần trước khi chạy terragrunt:
#   gsutil mb -p <project> -l asia-southeast1 -b on gs://ptmatch-terraform-state
#   gsutil versioning set on gs://ptmatch-terraform-state
remote_state {
  backend = "gcs"

  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }

  config = {
    bucket   = "ptmatch-terraform-state"
    prefix   = "${path_relative_to_include()}/terraform.tfstate"
    project  = local.project_id
    location = local.region
  }
}

generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = "${local.project_id}"
  region  = "${local.region}"
  zone    = "${local.zone}"
}
EOF
}

# Inputs chung cho mọi module
inputs = {
  project_id  = local.project_id
  region      = local.region
  zone        = local.zone
  environment = local.environment
}
