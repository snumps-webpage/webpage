terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state: uncomment once the state bucket is decided (run locally until then).
  # backend "s3" {
  #   bucket = "snumps-tfstate"
  #   key    = "webpage/terraform.tfstate"
  #   region = "ap-northeast-2"
  # }
}

provider "aws" {
  region = var.region
}
