import {
  MAX_EMAIL_IMAGE_BYTES,
  MAX_EMAIL_IMAGES,
  MAX_EMAIL_IMAGES_TOTAL_BYTES,
} from "../../convex/lib/emailAssets";

type SelectedImageFile = {
  name: string;
  type: string;
  size: number;
};

export function emailAssetUploadEndpoint(deploymentUrl: string, fileName: string) {
  const url = new URL(deploymentUrl);
  if (url.hostname.endsWith(".convex.cloud")) {
    url.hostname = `${url.hostname.slice(0, -".convex.cloud".length)}.convex.site`;
  } else if (url.port === "3210") {
    url.port = "3211";
  } else {
    throw new Error("The email image upload endpoint is not configured for this Convex deployment.");
  }
  url.pathname = "/email-assets/upload";
  url.search = new URLSearchParams({ filename: fileName }).toString();
  return url.toString();
}

export function validateSelectedEmailImages<T extends SelectedImageFile>({
  existingSizes,
  files,
}: {
  existingSizes: number[];
  files: T[];
}) {
  if (existingSizes.length + files.length > MAX_EMAIL_IMAGES) throw new Error("Add up to 3 images per email.");
  for (const file of files) {
    if (!(["image/png", "image/jpeg", "image/gif"] as string[]).includes(file.type)) {
      throw new Error(`${file.name} must be a PNG, JPEG, or GIF file.`);
    }
    if (file.size <= 0) throw new Error(`${file.name} is empty.`);
    if (file.size > MAX_EMAIL_IMAGE_BYTES) throw new Error(`${file.name} must be 1 MB or smaller.`);
  }
  const total = [...existingSizes, ...files.map(({ size }) => size)].reduce((sum, size) => sum + size, 0);
  if (total > MAX_EMAIL_IMAGES_TOTAL_BYTES) throw new Error("Email images must be 2 MB total or smaller.");
  return files;
}

export function formatImageSize(bytes: number) {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} kB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
