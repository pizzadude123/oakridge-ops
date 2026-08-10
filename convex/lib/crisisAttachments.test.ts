import { describe, expect, it } from "vitest";
import {
  isUnattachedCrisisAttachmentExpired,
  validateCrisisAttachmentBytes,
  validateCrisisAttachmentMetadata,
  validateCrisisAttachmentOwnerQuota,
  validateCrisisUploadHeaders,
} from "./crisisAttachments";

describe("crisis attachment validation", () => {
  it("accepts bounded committee document and image metadata", () => {
    expect(validateCrisisAttachmentMetadata({ contentType: "application/pdf", size: 2_500_000 })).toEqual({ contentType: "application/pdf", size: 2_500_000 });
    expect(validateCrisisAttachmentMetadata({ contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 10_000_000 }).size).toBe(10_000_000);
    expect(validateCrisisAttachmentMetadata({ contentType: "text/csv", size: 120 }).contentType).toBe("text/csv");
    expect(validateCrisisAttachmentMetadata({ contentType: "image/jpeg", size: 500 }).contentType).toBe("image/jpeg");
  });

  it("rejects executable, empty, and oversized uploads", () => {
    expect(() => validateCrisisAttachmentMetadata({ contentType: "application/x-msdownload", size: 200 })).toThrow("PDF, DOCX, XLSX, CSV, PNG, or JPEG");
    expect(() => validateCrisisAttachmentMetadata({ contentType: "application/pdf", size: 0 })).toThrow("empty");
    expect(() => validateCrisisAttachmentMetadata({ contentType: "application/pdf", size: 10_000_001 })).toThrow("10 MB");
  });

  it("validates HTTP upload headers before storage", () => {
    expect(validateCrisisUploadHeaders({ contentLength: "10000000", contentType: "application/pdf; charset=binary" })).toEqual({ contentType: "application/pdf", declaredSize: 10_000_000 });
    expect(() => validateCrisisUploadHeaders({ contentLength: "10000001", contentType: "application/pdf" })).toThrow("10 MB");
    expect(() => validateCrisisUploadHeaders({ contentLength: "NaN", contentType: "application/pdf" })).toThrow("invalid size");
  });

  it("detects MIME spoofing from file signatures", () => {
    expect(validateCrisisAttachmentBytes(new TextEncoder().encode("%PDF-1.7"), "application/pdf")).toBe(true);
    expect(validateCrisisAttachmentBytes(new TextEncoder().encode("PK\u0003\u0004[Content_Types].xml word/document.xml"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true);
    expect(validateCrisisAttachmentBytes(new TextEncoder().encode("PK\u0003\u0004[Content_Types].xml xl/workbook.xml"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(true);
    expect(() => validateCrisisAttachmentBytes(new TextEncoder().encode("PK\u0003\u0004[Content_Types].xml word/vbaProject.bin"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toThrow("does not match");
    expect(validateCrisisAttachmentBytes(new TextEncoder().encode("portfolio,directive\nRussia,Audit"), "text/csv")).toBe(true);
    expect(() => validateCrisisAttachmentBytes(new TextEncoder().encode("<script>"), "application/pdf")).toThrow("does not match");
    expect(() => validateCrisisAttachmentBytes(new Uint8Array([0, 1, 0, 2]), "text/csv")).toThrow("does not match");
  });

  it("rejects legacy binary Office formats", () => {
    expect(() => validateCrisisAttachmentMetadata({ contentType: "application/msword", size: 500 })).toThrow("PDF, DOCX, XLSX, CSV, PNG, or JPEG");
    expect(() => validateCrisisAttachmentMetadata({ contentType: "application/vnd.ms-excel", size: 500 })).toThrow("PDF, DOCX, XLSX, CSV, PNG, or JPEG");
  });

  it("expires abandoned files and bounds retained storage per publisher", () => {
    const now = 100_000_000;
    expect(isUnattachedCrisisAttachmentExpired(now - 86_400_000, undefined, now)).toBe(true);
    expect(isUnattachedCrisisAttachmentExpired(now - 86_400_000, "linked-update", now)).toBe(false);
    expect(() => validateCrisisAttachmentOwnerQuota(Array.from({ length: 19 }, () => ({ size: 1_000_000 })), 1_000_000)).not.toThrow();
    expect(() => validateCrisisAttachmentOwnerQuota(Array.from({ length: 20 }, () => ({ size: 1_000_000 })), 1_000_000)).toThrow("20 retained files");
    expect(() => validateCrisisAttachmentOwnerQuota([{ size: 95_000_000 }], 10_000_000)).toThrow("100 MB");
  });
});
