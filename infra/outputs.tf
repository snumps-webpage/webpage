# Everything an operator must copy into Vercel/GitHub lives here —
# no console spelunking (review M13).

output "s3_data_bucket" {
  value       = aws_s3_bucket.data.bucket
  description = "→ Vercel env S3_DATA_BUCKET"
}

output "s3_assets_bucket" {
  value       = aws_s3_bucket.assets.bucket
  description = "→ Vercel env S3_ASSETS_BUCKET"
}

output "runtime_role_arn" {
  value       = var.vercel_oidc_issuer != "" ? aws_iam_role.runtime[0].arn : null
  description = "→ Vercel env AWS_ROLE_ARN (OIDC mode)"
}

output "runtime_fallback_user" {
  value       = var.vercel_oidc_issuer == "" ? aws_iam_user.runtime_fallback[0].name : null
  description = "Key-mode IAM user — create its access key in the console, then set AWS_ACCESS_KEY_ID/SECRET"
}

output "migration_user" {
  value       = aws_iam_user.migration.name
  description = "IAM user for the one-off migration scripts (disable after cutover)"
}

output "data_kms_key_arn" {
  value       = aws_kms_key.data.arn
  description = "SSE-KMS key of the private data bucket"
}
