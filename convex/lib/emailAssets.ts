export const MAX_EMAIL_IMAGES = 3;
export const MAX_EMAIL_IMAGE_BYTES = 1_000_000;
export const MAX_EMAIL_IMAGES_TOTAL_BYTES = 2_000_000;
export const EMAIL_ASSET_RETENTION_MS = 24 * 60 * 60 * 1_000;
export const MAX_RETAINED_EMAIL_ASSETS_PER_OWNER = 12;
export const MAX_RETAINED_EMAIL_ASSET_BYTES_PER_OWNER = 8_000_000;

export type MailSafeImageType = "image/png" | "image/jpeg" | "image/gif";

export function isEmailAssetExpired(createdAt: number, now = Date.now()) {
  return now - createdAt >= EMAIL_ASSET_RETENTION_MS;
}

export function validateEmailAssetOwnerQuota(existing: Array<{ size: number }>, incomingSize: number) {
  if (existing.length >= MAX_RETAINED_EMAIL_ASSETS_PER_OWNER) {
    throw new Error(`Remove an image before uploading another. Each account may keep ${MAX_RETAINED_EMAIL_ASSETS_PER_OWNER} retained images.`);
  }
  const retainedBytes = existing.reduce((total, asset) => total + asset.size, 0);
  if (retainedBytes + incomingSize > MAX_RETAINED_EMAIL_ASSET_BYTES_PER_OWNER) {
    throw new Error("Remove an image before uploading another. Each account has an 8 MB retained-image limit.");
  }
}

export function validateEmailUploadHeaders(headers: { contentLength: string | null; contentType: string | null }) {
  const contentType = headers.contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const declaredSize = headers.contentLength === null ? null : Number(headers.contentLength);
  if (declaredSize !== null && (!Number.isSafeInteger(declaredSize) || declaredSize <= 0)) {
    throw new Error("The image file is empty or has an invalid size.");
  }
  const validated = validateEmailAssetMetadata({ contentType, size: declaredSize ?? 1 });
  return { contentType: validated.contentType, declaredSize };
}

export function validateEmailAssetMetadata(metadata: { contentType?: string | null; size: number }) {
  if (metadata.size <= 0) throw new Error("The image file is empty.");
  if (metadata.size > MAX_EMAIL_IMAGE_BYTES) throw new Error("Each email image must be 1 MB or smaller.");
  if (!(["image/png", "image/jpeg", "image/gif"] as string[]).includes(metadata.contentType ?? "")) {
    throw new Error("Email images must be PNG, JPEG, or GIF files.");
  }
  return { contentType: metadata.contentType as MailSafeImageType, size: metadata.size };
}

export function validateEmailAssetBatch(sizes: number[]) {
  if (sizes.length > MAX_EMAIL_IMAGES) throw new Error("Add up to 3 images per email.");
  if (sizes.reduce((total, size) => total + size, 0) > MAX_EMAIL_IMAGES_TOTAL_BYTES) {
    throw new Error("Email images must be 2 MB total or smaller.");
  }
  return true;
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

export function validateEmailImageBytes(bytes: Uint8Array, contentType: MailSafeImageType) {
  const valid = contentType === "image/png"
    ? startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    : contentType === "image/jpeg"
      ? startsWith(bytes, [0xff, 0xd8, 0xff])
      : startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61])
        || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  if (!valid) throw new Error(`The uploaded file does not match its declared ${contentType} type.`);
  return true;
}

export function inlineImageIdentity(index: number, contentType: MailSafeImageType) {
  const extension = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1];
  const number = index + 1;
  return {
    contentId: `oakridge-image-${number}`,
    fileName: `oakridge-image-${number}.${extension}`,
  };
}

export function emailAssetCampaignMaterial(assets: Array<{
  sha256: string;
  alt: string;
  placement?: "header" | "body" | "footer";
  width?: "full" | "wide" | "compact";
  alignment?: "left" | "center" | "right";
}>) {
  return JSON.stringify(assets.map(({ sha256, alt, placement = "body", width = "wide", alignment = "center" }) => ({
    sha256,
    alt,
    placement,
    width,
    alignment,
  })));
}
