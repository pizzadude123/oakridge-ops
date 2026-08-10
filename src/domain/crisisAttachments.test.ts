import { describe, expect, it } from "vitest";
import { crisisAttachmentDownloadEndpoint, crisisAttachmentUploadEndpoint, formatCrisisAttachmentSize, isCurrentCrisisUpload, validateSelectedCrisisAttachment } from "./crisisAttachments";

function file(name: string, type: string, size: number) {
  return { name, type, size };
}

describe("crisis attachment selection", () => {
  it("targets the authenticated HTTP-action origin for cloud and local deployments", () => {
    expect(crisisAttachmentUploadEndpoint("https://first-echidna-899.convex.cloud", "crisis brief.pdf"))
      .toBe("https://first-echidna-899.convex.site/crisis-attachments/upload?filename=crisis+brief.pdf");
    expect(crisisAttachmentUploadEndpoint("http://127.0.0.1:3210", "directive.docx"))
      .toBe("http://127.0.0.1:3211/crisis-attachments/upload?filename=directive.docx");
    expect(crisisAttachmentDownloadEndpoint("https://first-echidna-899.convex.cloud", "attachment-id"))
      .toBe("https://first-echidna-899.convex.site/crisis-attachments/download?id=attachment-id");
  });

  it("applies an upload response only to the editor session that started it", () => {
    expect(isCurrentCrisisUpload(4, 4)).toBe(true);
    expect(isCurrentCrisisUpload(4, 5)).toBe(false);
  });

  it("accepts one supported file up to 10 MB", () => {
    expect(validateSelectedCrisisAttachment(file("brief.pdf", "application/pdf", 10_000_000)).name).toBe("brief.pdf");
    expect(validateSelectedCrisisAttachment(file("evidence.csv", "text/csv", 2_000)).type).toBe("text/csv");
    expect(formatCrisisAttachmentSize(1_250_000)).toBe("1.3 MB");
  });

  it("rejects unsafe, empty, and oversized selections", () => {
    expect(() => validateSelectedCrisisAttachment(file("payload.exe", "application/x-msdownload", 300))).toThrow("PDF, DOCX, XLSX, CSV, PNG, or JPEG");
    expect(() => validateSelectedCrisisAttachment(file("empty.pdf", "application/pdf", 0))).toThrow("empty");
    expect(() => validateSelectedCrisisAttachment(file("huge.pdf", "application/pdf", 10_000_001))).toThrow("10 MB");
  });
});
