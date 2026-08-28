# ---- KMS key for the private data bucket (PII) ------------------------------

resource "aws_kms_key" "data" {
  description         = "SSE-KMS key for ${var.data_bucket_name}"
  enable_key_rotation = true
}

resource "aws_kms_alias" "data" {
  name          = "alias/snumps-data"
  target_key_id = aws_kms_key.data.key_id
}

# ---- public assets bucket ----------------------------------------------------

resource "aws_s3_bucket" "assets" {
  bucket = var.assets_bucket_name
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    id     = "noncurrent-versions-90d"
    status = "Enabled"
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }

  rule {
    id     = "abort-multipart-7d"
    status = "Enabled"
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  # Unregistered uploads: presign puts land here; promotion moves them out.
  rule {
    id     = "orphaned-pending-uploads-7d"
    status = "Enabled"
    filter {
      prefix = "uploads/pending/"
    }
    expiration {
      days = 7
    }
  }
}

# Bucket policy granting read to CloudFront only (OAC) — see cloudfront.tf.
resource "aws_s3_bucket_policy" "assets" {
  bucket = aws_s3_bucket.assets.id
  policy = data.aws_iam_policy_document.assets_oac.json
}

# ---- private data bucket (tables + audit + backups; PII) ---------------------

resource "aws_s3_bucket" "data" {
  bucket = var.data_bucket_name
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.data.arn
    }
    bucket_key_enabled = true # keeps KMS request costs down
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    id     = "noncurrent-versions-90d"
    status = "Enabled"
    filter {
      prefix = "tables/"
    }
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }

  rule {
    id     = "abort-multipart-7d"
    status = "Enabled"
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "backups-to-glacier"
    status = "Enabled"
    filter {
      prefix = "backups/"
    }
    transition {
      days          = 30
      storage_class = "GLACIER_IR"
    }
  }
}
