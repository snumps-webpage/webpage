import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "$env/dynamic/private";

/**
 * The ONLY module that touches the AWS SDK for data-plane S3 access
 * (IMPLEMENTATION-SPEC Phase 1). Everything above goes through tables.ts.
 */

let client: S3Client | null = null;

async function resolveCredentials() {
  // OIDC federation when a role is configured (Vercel); otherwise the
  // default chain (env keys) — covers local dev and the key fallback.
  if (env.AWS_ROLE_ARN) {
    const { awsCredentialsProvider } = await import("@vercel/functions/oidc");
    return awsCredentialsProvider({ roleArn: env.AWS_ROLE_ARN });
  }
  return undefined;
}

async function getClient(): Promise<S3Client> {
  if (!client) {
    client = new S3Client({
      region: env.AWS_REGION || "ap-northeast-2",
      credentials: await resolveCredentials(),
    });
  }
  return client;
}

export function dataBucket(): string {
  const bucket = env.S3_DATA_BUCKET;
  if (!bucket) throw new Error("S3_DATA_BUCKET is not set");
  return bucket;
}

export function assetsBucket(): string {
  const bucket = env.S3_ASSETS_BUCKET;
  if (!bucket) throw new Error("S3_ASSETS_BUCKET is not set");
  return bucket;
}

type AwsError = { name?: string; $metadata?: { httpStatusCode?: number } };

function statusOf(e: unknown): number | undefined {
  const err = e as AwsError;
  if (err.$metadata?.httpStatusCode) return err.$metadata.httpStatusCode;
  if (err.name === "NoSuchKey" || err.name === "NotFound") return 404;
  if (err.name === "PreconditionFailed") return 412;
  if (err.name === "ConditionalRequestConflict") return 409;
  if (err.name === "304" || err.name === "NotModified") return 304;
  return undefined;
}

export class ConditionalWriteError extends Error {
  constructor(readonly httpStatus: number) {
    super(`conditional write failed (${httpStatus})`);
    this.name = "ConditionalWriteError";
  }
}

export type GetResult =
  | { status: 200; body: Uint8Array; etag: string }
  | { status: 304 }
  | { status: 404 };

export async function getObjectWithEtag(
  bucket: string,
  key: string,
  ifNoneMatch?: string,
): Promise<GetResult> {
  const s3 = await getClient();
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, IfNoneMatch: ifNoneMatch }),
    );
    const body = await res.Body!.transformToByteArray();
    return { status: 200, body, etag: res.ETag ?? "" };
  } catch (e) {
    const status = statusOf(e);
    if (status === 404) return { status: 404 };
    if (status === 304) return { status: 304 };
    throw e;
  }
}

export async function putObjectConditional(
  bucket: string,
  key: string,
  body: Uint8Array,
  opts: {
    ifMatch?: string;
    ifNoneMatch?: "*";
    contentType: string;
    contentEncoding?: string;
  },
): Promise<{ etag: string }> {
  const s3 = await getClient();
  try {
    const res = await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: opts.contentType,
        ContentEncoding: opts.contentEncoding,
        IfMatch: opts.ifMatch,
        IfNoneMatch: opts.ifNoneMatch,
      }),
    );
    return { etag: res.ETag ?? "" };
  } catch (e) {
    const status = statusOf(e);
    // 412: someone wrote first · 409: concurrent conditional PUTs ·
    // 404: the object vanished under an If-Match — all retryable upstream.
    if (status === 412 || status === 409 || status === 404) {
      throw new ConditionalWriteError(status);
    }
    throw e;
  }
}

export async function deleteObject(bucket: string, key: string): Promise<void> {
  const s3 = await getClient();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function listKeys(bucket: string, prefix: string): Promise<string[]> {
  const s3 = await getClient();
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

export async function headObject(
  bucket: string,
  key: string,
): Promise<{ contentLength: number; contentType: string } | null> {
  const s3 = await getClient();
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return {
      contentLength: res.ContentLength ?? 0,
      contentType: res.ContentType ?? "application/octet-stream",
    };
  } catch (e) {
    // 403 defensively treated as absent: without ListBucket, S3 masks a
    // missing key as AccessDenied (review C3) — never surface that as a 500.
    const status = statusOf(e);
    if (status === 404 || status === 403) return null;
    throw e;
  }
}

export async function copyObject(
  bucket: string,
  fromKey: string,
  toKey: string,
): Promise<void> {
  const s3 = await getClient();
  await s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${encodeURIComponent(fromKey)}`,
      Key: toKey,
    }),
  );
}

/** Presigned PUT for browser-direct uploads (SYS-03). Content-Type is signed. */
export async function presignPut(
  bucket: string,
  key: string,
  contentType: string,
  expiresInSeconds = 600,
): Promise<string> {
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const s3 = await getClient();
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds },
  );
}

/** For fire-and-forget single-object writes (audit log): no conditions, unique keys. */
export async function putObject(
  bucket: string,
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const s3 = await getClient();
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );
}
