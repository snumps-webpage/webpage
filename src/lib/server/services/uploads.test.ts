import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/data/s3", () => import("$lib/server/data/s3-memory"));

import { __keys, __reset, __uploadPending } from "$lib/server/data/s3-memory";
import { AppError } from "$lib/server/core/errors";
import {
  createPresignedUpload,
  promotePendingUpload,
  slugifyFilename,
} from "./uploads";

beforeEach(() => {
  __reset();
});

describe("presign validation (§8-2)", () => {
  it("refuses unknown purposes, wrong types, and out-of-range sizes", async () => {
    const base = { filename: "a.pdf", contentType: "application/pdf", size: 1000 };
    for (const bad of [
      { ...base, purpose: "nope" },
      { purpose: "seminar-material", ...base, contentType: "image/png" },
      { purpose: "seminar-material", ...base, size: 0 },
      { purpose: "seminar-material", ...base, size: 51_000_000 },
    ]) {
      await expect(createPresignedUpload(bad)).rejects.toSatisfy(
        (e) => e instanceof AppError && e.code === "VALIDATION_FAILED",
      );
    }
  });

  it("issues a pending-prefixed key and a URL", async () => {
    const { uploadUrl, s3Key } = await createPresignedUpload({
      purpose: "seminar-photo", filename: "발표 사진.PNG", contentType: "image/png", size: 500,
    });
    expect(s3Key).toMatch(/^uploads\/pending\/seminar-photo\/.+\.png$/);
    expect(uploadUrl).toContain("presigned");
  });
});

describe("promotion — the real enforcement point (review §8-2)", () => {
  it("promotes a valid pending object to a final hashed key and deletes the pending one", async () => {
    const { s3Key } = await createPresignedUpload({
      purpose: "seminar-photo", filename: "p.png", contentType: "image/png", size: 500,
    });
    __uploadPending(s3Key, 500);

    const finalKey = await promotePendingUpload(s3Key, "seminar-photo", "rec-1");
    expect(finalKey).toMatch(/^seminars\/rec-1\/[a-z0-9]{8}-.+\.png$/);
    expect(__keys()).toContain(finalKey);
    expect(__keys()).not.toContain(s3Key); // pending removed
  });

  it("refuses keys outside the purpose prefix", async () => {
    await expect(
      promotePendingUpload("tables/members.json.gz", "seminar-photo", "rec"),
    ).rejects.toSatisfy((e) => e instanceof AppError && e.code === "VALIDATION_FAILED");
  });

  it("reports NOT_FOUND for a never-uploaded or lifecycle-reaped key", async () => {
    const { s3Key } = await createPresignedUpload({
      purpose: "study-photo", filename: "p.png", contentType: "image/png", size: 500,
    });
    // no __uploadPending — the object never landed (or was reaped)
    await expect(promotePendingUpload(s3Key, "study-photo", "rec")).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "NOT_FOUND",
    );
  });

  it("refuses oversize and content-type-spoofed uploads at promotion time", async () => {
    const { s3Key } = await createPresignedUpload({
      purpose: "gallery-photo", filename: "p.png", contentType: "image/png", size: 500,
    });
    __uploadPending(s3Key, 11_000_000); // lied about the size
    await expect(promotePendingUpload(s3Key, "gallery-photo", "rec")).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "VALIDATION_FAILED",
    );

    const second = await createPresignedUpload({
      purpose: "gallery-photo", filename: "q.png", contentType: "image/png", size: 500,
    });
    __uploadPending(second.s3Key, 500, "application/x-executable"); // spoofed type
    await expect(
      promotePendingUpload(second.s3Key, "gallery-photo", "rec"),
    ).rejects.toSatisfy((e) => e instanceof AppError && e.code === "VALIDATION_FAILED");
  });
});

describe("slugifyFilename", () => {
  it("keeps hangul, lowercases, and defaults sensibly", () => {
    expect(slugifyFilename("발표 자료 v2.PDF")).toEqual({ slug: "발표-자료-v2", ext: "pdf" });
    expect(slugifyFilename("...")).toEqual({ slug: "file", ext: "bin" });
  });
});
