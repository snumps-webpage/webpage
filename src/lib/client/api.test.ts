import { describe, expect, it, vi } from "vitest";
import {
  ApiRequestError,
  fetchAdminQueue,
  requestJson,
  uploadAdminFile,
} from "./api";
import {
  presignRequestSchema,
  queueResponseEnvelopeSchema,
} from "$lib/domain/api";

describe("frontend API client", () => {
  it("keeps the REST error code and status", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "FORBIDDEN" }), { status: 403 }),
    ) as typeof fetch;
    await expect(
      requestJson("/api/test", undefined, fetcher),
    ).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 403,
      code: "FORBIDDEN",
    });
  });

  it("accepts only the shared queue envelope", async () => {
    const valid = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            items: [{ id: "1" }],
            generatedAt: "2026-08-28T00:00:00Z",
          }),
        ),
    ) as typeof fetch;
    await expect(
      fetchAdminQueue<{ id: string }>("/api/admin/applications", valid),
    ).resolves.toMatchObject({ items: [{ id: "1" }] });
    const invalid = vi.fn(
      async () => new Response(JSON.stringify([{ id: "1" }])),
    ) as typeof fetch;
    await expect(
      fetchAdminQueue("/api/admin/applications", invalid),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("rejects malformed queue timestamps and presign operation ids", () => {
    expect(
      queueResponseEnvelopeSchema.safeParse({
        success: true,
        items: [],
        generatedAt: "today",
      }).success,
    ).toBe(false);
    expect(
      presignRequestSchema.safeParse({
        operationId: "not-a-uuid",
        purpose: "seminar-material",
        filename: "notes.pdf",
        contentType: "application/pdf",
        size: 10,
      }).success,
    ).toBe(false);
  });

  it("retries network and 5xx PUT failures but never retries 4xx", async () => {
    const file = new File(["notes"], "notes.pdf", { type: "application/pdf" });
    const operationId = "01991b5d-2eef-7a71-a664-d38e09285195";
    const presign = {
      success: true,
      uploadUrl: "https://upload.example/file",
      s3Key: "pending/file",
    } as const;
    const retrying = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(presign)))
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(null, { status: 200 }),
      ) as typeof fetch;
    await expect(
      uploadAdminFile(
        file,
        "seminar-material",
        operationId,
        retrying,
      ),
    ).resolves.toMatchObject({ s3Key: "pending/file" });
    expect(retrying).toHaveBeenCalledTimes(4);

    const rejecting = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(presign)))
      .mockResolvedValueOnce(
        new Response(null, { status: 403 }),
      ) as typeof fetch;
    await expect(
      uploadAdminFile(
        file,
        "seminar-material",
        operationId,
        rejecting,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(rejecting).toHaveBeenCalledTimes(2);
  });
});
