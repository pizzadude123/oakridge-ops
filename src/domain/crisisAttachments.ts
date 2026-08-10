import {
  CRISIS_ATTACHMENT_CONTENT_TYPES,
  MAX_CRISIS_ATTACHMENT_BYTES,
} from "../../convex/lib/crisisAttachments";

type SelectedCrisisFile = {
  name: string;
  type: string;
  size: number;
};

export const CRISIS_ATTACHMENT_ACCEPT = CRISIS_ATTACHMENT_CONTENT_TYPES.join(",");

export function crisisAttachmentUploadEndpoint(deploymentUrl: string, fileName: string) {
  const url = new URL(deploymentUrl);
  if (url.hostname.endsWith(".convex.cloud")) {
    url.hostname = `${url.hostname.slice(0, -".convex.cloud".length)}.convex.site`;
  } else if (url.port === "3210") {
    url.port = "3211";
  } else {
    throw new Error("The crisis attachment upload endpoint is not configured for this Convex deployment.");
  }
  url.pathname = "/crisis-attachments/upload";
  url.search = new URLSearchParams({ filename: fileName }).toString();
  return url.toString();
}

export function validateSelectedCrisisAttachment<T extends SelectedCrisisFile>(file: T) {
  if (!(CRISIS_ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    throw new Error(`${file.name} must be a PDF, DOCX, XLSX, CSV, PNG, or JPEG file.`);
  }
  if (file.size <= 0) throw new Error(`${file.name} is empty.`);
  if (file.size > MAX_CRISIS_ATTACHMENT_BYTES) throw new Error(`${file.name} must be 10 MB or smaller.`);
  return file;
}

export function formatCrisisAttachmentSize(bytes: number) {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} kB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
