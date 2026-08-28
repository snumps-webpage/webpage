import type {
  AdminQueuePath,
  PresignRequest,
  QueueResponse,
  UploadPurpose,
} from "$lib/domain/api";
import {
  presignSuccessSchema,
  queueResponseEnvelopeSchema,
  restErrorEnvelopeSchema,
} from "$lib/domain/api";

export type Fetcher = typeof fetch;

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function errorEnvelope(value: unknown) {
  const result = restErrorEnvelopeSchema.safeParse(value);
  return result.success ? result.data : null;
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fetcher: Fetcher = fetch,
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(input, init);
  } catch {
    throw new ApiRequestError(
      "네트워크에 연결할 수 없습니다.",
      0,
      "NETWORK_ERROR",
    );
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    if (response.ok) {
      throw new ApiRequestError(
        "서버 응답 형식이 올바르지 않습니다.",
        response.status,
        "INVALID_RESPONSE",
      );
    }
  }

  if (!response.ok) {
    const envelope = errorEnvelope(body);
    throw new ApiRequestError(
      envelope?.error ?? "요청을 처리하지 못했습니다.",
      response.status,
      envelope?.error ?? "REQUEST_FAILED",
    );
  }
  return body as T;
}

export async function fetchAdminQueue<T>(
  path: AdminQueuePath,
  fetcher: Fetcher = fetch,
) {
  const value = await requestJson<unknown>(
    path,
    { headers: { Accept: "application/json" } },
    fetcher,
  );
  const result = queueResponseEnvelopeSchema.safeParse(value);
  if (!result.success) {
    throw new ApiRequestError(
      "관리자 큐 응답 형식이 올바르지 않습니다.",
      200,
      "INVALID_RESPONSE",
    );
  }
  return result.data as QueueResponse<T>;
}

export interface AdminUploadResult {
  operationId: string;
  s3Key: string;
  purpose: UploadPurpose;
  filename: string;
  contentType: string;
  size: number;
}

export async function uploadAdminFile(
  file: File,
  purpose: UploadPurpose,
  operationId: string,
  fetcher: Fetcher = fetch,
): Promise<AdminUploadResult> {
  const presignInput: PresignRequest = {
    operationId,
    purpose,
    filename: file.name,
    contentType: file.type,
    size: file.size,
  };
  const presignBody = await requestJson<unknown>(
    "/api/uploads/presign",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(presignInput),
    },
    fetcher,
  );
  const parsedPresign = presignSuccessSchema.safeParse(presignBody);
  if (!parsedPresign.success) {
    throw new ApiRequestError(
      "업로드 서명 응답 형식이 올바르지 않습니다.",
      200,
      "INVALID_RESPONSE",
    );
  }
  const presign = parsedPresign.data;

  let lastError: ApiRequestError | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetcher(presign.upload.url, {
        method: "PUT",
        headers: presign.upload.headers,
        body: file,
      });
      if (response.ok) return presign.file;
      const retryable = response.status >= 500;
      lastError = new ApiRequestError(
        "파일 업로드에 실패했습니다.",
        response.status,
        "UPLOAD_FAILED",
      );
      if (!retryable) break;
    } catch {
      lastError = new ApiRequestError(
        "파일 업로드 중 네트워크 오류가 발생했습니다.",
        0,
        "NETWORK_ERROR",
      );
    }
  }
  throw (
    lastError ??
    new ApiRequestError("파일 업로드에 실패했습니다.", 0, "UPLOAD_FAILED")
  );
}
