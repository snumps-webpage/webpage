variable "region" {
  type    = string
  default = "ap-northeast-2"
}

variable "assets_bucket_name" {
  type    = string
  default = "snumps-assets"
}

variable "data_bucket_name" {
  type    = string
  default = "snumps-data-private"
}

# Vercel OIDC federation. Leave empty to skip the OIDC trust (key-based fallback).
# Issuer URL and team slug come from the Vercel project settings (OIDC tab).
variable "vercel_oidc_issuer" {
  type    = string
  default = ""
}

variable "vercel_team_slug" {
  type    = string
  default = ""
}

variable "vercel_project_name" {
  type    = string
  default = "snumps"
}

variable "budget_monthly_usd" {
  type    = number
  default = 10
}

variable "budget_alert_email" {
  type    = string
  default = "snumps0@gmail.com"
}
