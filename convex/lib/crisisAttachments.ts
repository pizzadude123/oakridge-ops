export const MAX_CRISIS_ATTACHMENT_BYTES = 10_000_000;
export const MAX_RETAINED_CRISIS_ATTACHMENTS_PER_OWNER = 20;
export const MAX_RETAINED_CRISIS_ATTACHMENT_BYTES_PER_OWNER = 100_000_000;
export const CRISIS_ATTACHMENT_RETENTION_MS = 24 * 60 * 60 * 1_000;

export const CRISIS_ATTACHMENT_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "image/png",
  "image/jpeg",
] as const;

export type CrisisAttachmentContentType = typeof CRISIS_ATTACHMENT_CONTENT_TYPES[number];

export function isUnattachedCrisisAttachmentExpired(createdAt: number, updateId?: string, now = Date.now()) {
  return !updateId && now - createdAt >= CRISIS_ATTACHMENT_RETENTION_MS;
}

export function validateCrisisAttachmentOwnerQuota(existing: Array<{ size: number }>, incomingSize: number) {
  if (existing.length >= MAX_RETAINED_CRISIS_ATTACHMENTS_PER_OWNER) {
    throw new Error(`Remove a file before uploading another. Each publisher may keep ${MAX_RETAINED_CRISIS_ATTACHMENTS_PER_OWNER} retained files.`);
  }
  const retainedBytes = existing.reduce((total, attachment) => total + attachment.size, 0);
  if (retainedBytes + incomingSize > MAX_RETAINED_CRISIS_ATTACHMENT_BYTES_PER_OWNER) {
    throw new Error("Remove a file before uploading another. Each publisher has a 100 MB retained-file limit.");
  }
}

export function validateCrisisUploadHeaders(headers: { contentLength: string | null; contentType: string | null }) {
  const contentType = headers.contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const declaredSize = headers.contentLength === null ? null : Number(headers.contentLength);
  if (declaredSize !== null && (!Number.isSafeInteger(declaredSize) || declaredSize <= 0)) {
    throw new Error("The attachment is empty or has an invalid size.");
  }
  const validated = validateCrisisAttachmentMetadata({ contentType, size: declaredSize ?? 1 });
  return { contentType: validated.contentType, declaredSize };
}

export function validateCrisisAttachmentMetadata(metadata: { contentType?: string | null; size: number }) {
  if (metadata.size <= 0) throw new Error("The attachment is empty.");
  if (metadata.size > MAX_CRISIS_ATTACHMENT_BYTES) throw new Error("Crisis attachments must be 10 MB or smaller.");
  if (!(CRISIS_ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(metadata.contentType ?? "")) {
    throw new Error("Crisis attachments must be PDF, DOCX, XLSX, CSV, PNG, or JPEG files.");
  }
  return { contentType: metadata.contentType as CrisisAttachmentContentType, size: metadata.size };
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function isUtf8Text(bytes: Uint8Array) {
  if (bytes.some((value) => value === 0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function containsAscii(bytes: Uint8Array, value: string) {
  const needle = new TextEncoder().encode(value);
  outer: for (let index = 0; index <= bytes.length - needle.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (bytes[index + offset] !== needle[offset]) continue outer;
    }
    return true;
  }
  return false;
}

export function validateCrisisAttachmentBytes(bytes: Uint8Array, contentType: CrisisAttachmentContentType) {
  const zip = startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
  const safeOfficePackage = zip
    && containsAscii(bytes, "[Content_Types].xml")
    && !containsAscii(bytes, "vbaProject.bin");
  const valid = contentType === "application/pdf"
    ? startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])
    : contentType === "image/png"
      ? startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      : contentType === "image/jpeg"
        ? startsWith(bytes, [0xff, 0xd8, 0xff])
        : contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          ? safeOfficePackage && containsAscii(bytes, "word/")
          : contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ? safeOfficePackage && containsAscii(bytes, "xl/")
            : contentType === "text/csv"
              ? isUtf8Text(bytes)
              : false;
  if (!valid) throw new Error(`The uploaded file does not match its declared ${contentType} type.`);
  return true;
}
