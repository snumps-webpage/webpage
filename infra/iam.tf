# ---- runtime role: exactly the permission inventory of IMPLEMENTATION-SPEC BE-02

data "aws_iam_policy_document" "runtime" {
  statement {
    sid       = "Tables"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${aws_s3_bucket.data.arn}/tables/*"]
  }

  statement {
    sid       = "AuditAppendOnly"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.data.arn}/audit/*"]
  }

  statement {
    sid       = "QueueDelete"
    actions   = ["s3:DeleteObject"]
    resources = ["${aws_s3_bucket.data.arn}/tables/attendance-queue/*"]
  }

  # Without ListBucket, GetObject on a missing key returns 403 instead of 404,
  # breaking the data layer's create-on-404 bootstrap.
  statement {
    sid       = "ListTables"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.data.arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["tables/*"]
    }
  }

  statement {
    sid       = "Assets"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${aws_s3_bucket.assets.arn}/*"]
  }

  statement {
    sid       = "PendingUploadPromotion"
    actions   = ["s3:DeleteObject"]
    resources = ["${aws_s3_bucket.assets.arn}/uploads/pending/*"]
  }

  statement {
    sid       = "DataKms"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [aws_kms_key.data.arn]
  }
}

resource "aws_iam_policy" "runtime" {
  name   = "snumps-runtime"
  policy = data.aws_iam_policy_document.runtime.json
}

# OIDC trust to Vercel — created only when the issuer is configured.
resource "aws_iam_openid_connect_provider" "vercel" {
  count           = var.vercel_oidc_issuer != "" ? 1 : 0
  url             = var.vercel_oidc_issuer
  client_id_list  = ["https://vercel.com/${var.vercel_team_slug}"]
  thumbprint_list = [] # provider fetches automatically on recent AWS provider versions
}

data "aws_iam_policy_document" "runtime_trust" {
  count = var.vercel_oidc_issuer != "" ? 1 : 0

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.vercel[0].arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${replace(var.vercel_oidc_issuer, "https://", "")}:sub"
      values = [
        "owner:${var.vercel_team_slug}:project:${var.vercel_project_name}:environment:production",
        "owner:${var.vercel_team_slug}:project:${var.vercel_project_name}:environment:preview",
      ]
    }
  }
}

resource "aws_iam_role" "runtime" {
  count              = var.vercel_oidc_issuer != "" ? 1 : 0
  name               = "snumps-runtime"
  assume_role_policy = data.aws_iam_policy_document.runtime_trust[0].json
}

resource "aws_iam_role_policy_attachment" "runtime" {
  count      = var.vercel_oidc_issuer != "" ? 1 : 0
  role       = aws_iam_role.runtime[0].name
  policy_arn = aws_iam_policy.runtime.arn
}

# Key-based fallback while OIDC is not configured: an IAM user with the SAME
# runtime policy — no broader.
resource "aws_iam_user" "runtime_fallback" {
  count = var.vercel_oidc_issuer == "" ? 1 : 0
  name  = "snumps-runtime"
}

resource "aws_iam_user_policy_attachment" "runtime_fallback" {
  count      = var.vercel_oidc_issuer == "" ? 1 : 0
  user       = aws_iam_user.runtime_fallback[0].name
  policy_arn = aws_iam_policy.runtime.arn
}

# ---- migration role: human-run one-off scripts; disable after cutover --------

data "aws_iam_policy_document" "migration" {
  statement {
    actions = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [
      aws_s3_bucket.data.arn,
      "${aws_s3_bucket.data.arn}/*",
      aws_s3_bucket.assets.arn,
      "${aws_s3_bucket.assets.arn}/*",
    ]
  }

  statement {
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [aws_kms_key.data.arn]
  }
}

resource "aws_iam_policy" "migration" {
  name   = "snumps-migration"
  policy = data.aws_iam_policy_document.migration.json
}

resource "aws_iam_user" "migration" {
  name = "snumps-migration"
}

resource "aws_iam_user_policy_attachment" "migration" {
  user       = aws_iam_user.migration.name
  policy_arn = aws_iam_policy.migration.arn
}
