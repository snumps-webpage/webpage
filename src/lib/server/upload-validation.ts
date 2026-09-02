import type { AdminContentFile } from "$lib/domain/admin-records";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PDF_TYPE = "application/pdf";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PDF_BYTES = 50 * 1024 * 1024;

export type ContentFileValidation =
  | { success: true; file: AdminContentFile }
  | { success: false; status: 400 | 413; message: string };

export function validateContentFile(
  value: FormDataEntryValue | null,
  options: { allowPdf?: boolean } = {},
): ContentFileValidation {
  if (!(value instanceof File) || value.size === 0) {
    return {
      success: false,
      status: 400,
      message: "업로드할 파일을 선택해 주세요.",
    };
  }
  const kind =
    value.type === PDF_TYPE && options.allowPdf !== false
      ? "pdf"
      : IMAGE_TYPES.has(value.type)
        ? "image"
        : null;
  if (!kind) {
    return {
      success: false,
      status: 400,
      message:
        options.allowPdf === false
          ? "JPEG, PNG 또는 WebP 이미지만 업로드할 수 있습니다."
          : "PDF, JPEG, PNG 또는 WebP 파일만 업로드할 수 있습니다.",
    };
  }
  const maximum = kind === "pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (value.size > maximum) {
    return {
      success: false,
      status: 413,
      message:
        kind === "pdf"
          ? "PDF는 50MB 이하여야 합니다."
          : "이미지는 10MB 이하여야 합니다.",
    };
  }
  return {
    success: true,
    file: {
      id: `file-${crypto.randomUUID()}`,
      name: value.name,
      kind,
      url: null,
      contentType: value.type,
      size: value.size,
    },
  };
}
