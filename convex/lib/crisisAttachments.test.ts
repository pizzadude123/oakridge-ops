import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  addOfficeExpandedBytes,
  deleteStoredAttachmentSafely,
  isUnattachedCrisisAttachmentExpired,
  officeCrc32,
  OFFICE_PACKAGE_MAX_EXPANDED_BYTES,
  readStreamWithLimit,
  validateCrisisAttachmentBytes,
  validateCrisisAttachmentFileName,
  validateCrisisAttachmentMetadata,
  validateCrisisAttachmentOwnerQuota,
  validateCrisisUploadHeaders,
} from "./crisisAttachments";

function testCrc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipWithEntries(names: string[], overrides: Record<string, string | Uint8Array> = {}) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const name of names) {
    const fileName = encoder.encode(name);
    const source = overrides[name] ?? (name === "[Content_Types].xml" ? "<Types><Default Extension='xml' ContentType='application/xml'/></Types>"
      : name === "_rels/.rels" ? "<Relationships><Relationship Type='http://schemas/x/officeDocument' Target='word/document.xml'/></Relationships>"
        : name === "word/document.xml" ? "<w:document><w:body/></w:document>"
          : name === "xl/workbook.xml" ? "<workbook><sheets/></workbook>" : "payload");
    const content = typeof source === "string" ? encoder.encode(source) : source;
    const crc = testCrc32(content);
    const local = new Uint8Array(30 + fileName.length + content.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, content.length, true);
    localView.setUint32(22, content.length, true);
    localView.setUint16(26, fileName.length, true);
    local.set(fileName, 30);
    local.set(content, 30 + fileName.length);
    localParts.push(local);

    const central = new Uint8Array(46 + fileName.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, content.length, true);
    centralView.setUint32(24, content.length, true);
    centralView.setUint16(28, fileName.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(fileName, 46);
    centralParts.push(central);
    localOffset += local.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, names.length, true);
  endView.setUint16(10, names.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  const output = new Uint8Array(localOffset + centralSize + end.length);
  let offset = 0;
  for (const part of [...localParts, ...centralParts, end]) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

describe("crisis attachment validation", () => {
  it("matches the standard CRC-32 vector and enforces total expansion bounds", () => {
    expect(officeCrc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(addOfficeExpandedBytes(60_000_000, 40_000_000)).toBe(OFFICE_PACKAGE_MAX_EXPANDED_BYTES);
    expect(() => addOfficeExpandedBytes(60_000_000, 40_000_001)).toThrow("safe processing limit");
  });

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

  it("detects MIME spoofing and malformed Office packages", async () => {
    await expect(validateCrisisAttachmentBytes(new TextEncoder().encode("%PDF-1.7"), "application/pdf")).resolves.toBe(true);
    await expect(validateCrisisAttachmentBytes(zipWithEntries(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).resolves.toBe(true);
    await expect(validateCrisisAttachmentBytes(zipWithEntries(["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml"]), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).resolves.toBe(true);
    await expect(validateCrisisAttachmentBytes(new TextEncoder().encode("PK\u0003\u0004[Content_Types].xml word/document.xml"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).rejects.toThrow("valid Office package");
    await expect(validateCrisisAttachmentBytes(zipWithEntries(["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/VbaProject.Bin"]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).rejects.toThrow("active content");
    await expect(validateCrisisAttachmentBytes(zipWithEntries(["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/media/renamed.bin"]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).rejects.toThrow("binary parts");
    await expect(validateCrisisAttachmentBytes(zipWithEntries(
      ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/media/photo.png"],
      { "word/media/photo.png": new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]) },
    ), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).rejects.toThrow("embedded binary content");
    for (const signature of [
      [0x4d, 0x5a], [0x7f, 0x45, 0x4c, 0x46], [0x50, 0x4b, 0x03, 0x04],
      [0xca, 0xfe, 0xba, 0xbe], [0xcf, 0xfa, 0xed, 0xfe],
    ]) {
      await expect(validateCrisisAttachmentBytes(zipWithEntries(
        ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/media/photo.png"],
        { "word/media/photo.png": new Uint8Array([...signature, 0, 0, 0, 0]) },
      ), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).rejects.toThrow("embedded binary content");
    }
    for (const script of ["#!/bin/sh\nexit 0", "<script>alert(1)</script>"]) {
      await expect(validateCrisisAttachmentBytes(zipWithEntries(
        ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/media/photo.svg"],
        { "word/media/photo.svg": script },
      ), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).rejects.toThrow("embedded binary content");
    }
    await expect(validateCrisisAttachmentBytes(zipWithEntries(
      ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/_rels/document.xml.rels"],
      { "word/_rels/document.xml.rels": "<Relationships><Relationship Type='http://schemas/x/oleObject' Target='payload.dat'/></Relationships>" },
    ), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).rejects.toThrow("active or external content");
    await expect(validateCrisisAttachmentBytes(zipWithEntries(
      ["[Content_Types].xml", "_rels/.rels", "word/document.xml"],
      { "_rels/.rels": "<Relationships><Relationship Type='http://schemas/x/officeDocument' Target='https://example.invalid/doc' TargetMode='&#x45;xternal'/></Relationships>" },
    ), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).rejects.toThrow("active or external content");
    await expect(validateCrisisAttachmentBytes(zipWithEntries(
      ["[Content_Types].xml", "_rels/.rels", "word/document.xml"],
      { "[Content_Types].xml": "<Types><Override ContentType='application/vnd.ms-word.document.macroEnabled.12'/></Types>" },
    ), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).rejects.toThrow("active content");
    await expect(validateCrisisAttachmentBytes(zipWithEntries(
      ["[Content_Types].xml", "_rels/.rels", "word/document.xml"],
      { "[Content_Types].xml": "<Types><Override ContentType='application/vnd.ms-word.document.macro&#x45;nabled.12'/></Types>" },
    ), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).rejects.toThrow("active content");
    await expect(validateCrisisAttachmentBytes(zipWithEntries(
      ["[Content_Types].xml", "_rels/.rels", "word/document.xml"],
      { "[Content_Types].xml": "<Types><" },
    ), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).rejects.toThrow("malformed");
    for (const unsafeXml of [
      "<!DOCTYPE Types [<!ENTITY xxe SYSTEM 'file:///etc/passwd'>]><Types><Default Extension='xml' ContentType='&xxe;'/></Types>",
      "<Relationships><Relationship></Relationships>",
    ]) {
      const target = unsafeXml.startsWith("<Relationships") ? "_rels/.rels" : "[Content_Types].xml";
      await expect(validateCrisisAttachmentBytes(zipWithEntries(
        ["[Content_Types].xml", "_rels/.rels", "word/document.xml"], { [target]: unsafeXml },
      ), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).rejects.toThrow(/malformed|unsafe/);
    }
    const corrupt = zipWithEntries(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]);
    const firstNameLength = new DataView(corrupt.buffer).getUint16(26, true);
    corrupt[30 + firstNameLength] ^= 0xff;
    await expect(validateCrisisAttachmentBytes(corrupt, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).rejects.toThrow("corrupt");
    await expect(validateCrisisAttachmentBytes(zipWithEntries(["[Content_Types].xml", "_rels/.rels", "word/document.xml", "../payload.exe"]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).rejects.toThrow("unsafe path");
    await expect(validateCrisisAttachmentBytes(new TextEncoder().encode("portfolio,directive\nRussia,Audit"), "text/csv")).resolves.toBe(true);
    await expect(validateCrisisAttachmentBytes(new TextEncoder().encode("<script>"), "application/pdf")).rejects.toThrow("does not match");
    await expect(validateCrisisAttachmentBytes(new Uint8Array([0, 1, 0, 2]), "text/csv")).rejects.toThrow("does not match");
  });

  it("accepts a real compressed OOXML workbook", async () => {
    const workbook = await readFile(`${process.cwd()}/public/Oakridge-MUN-Registration-Test.xlsx`);
    await expect(validateCrisisAttachmentBytes(
      new Uint8Array(workbook),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )).resolves.toBe(true);
  });

  it("rejects legacy binary Office formats", () => {
    expect(() => validateCrisisAttachmentMetadata({ contentType: "application/msword", size: 500 })).toThrow("PDF, DOCX, XLSX, CSV, PNG, or JPEG");
    expect(() => validateCrisisAttachmentMetadata({ contentType: "application/vnd.ms-excel", size: 500 })).toThrow("PDF, DOCX, XLSX, CSV, PNG, or JPEG");
  });

  it("requires the file extension to agree with the verified MIME type", () => {
    expect(validateCrisisAttachmentFileName("delegate brief.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("delegate brief.docx");
    expect(() => validateCrisisAttachmentFileName("delegate brief.pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toThrow("DOCX");
    expect(() => validateCrisisAttachmentFileName("brief\u202Efdp.exe", "application/pdf")).toThrow("control characters");
  });

  it("stops reading an oversized stream before buffering the complete body", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(6));
        controller.enqueue(new Uint8Array(5));
        controller.enqueue(new Uint8Array(50));
      },
      cancel() { cancelled = true; },
    });
    await expect(readStreamWithLimit(stream, 10)).rejects.toThrow("10 MB");
    expect(cancelled).toBe(true);
  });

  it("retains registry metadata when storage deletion fails", async () => {
    let registryDeletes = 0;
    await expect(deleteStoredAttachmentSafely(
      async () => { throw new Error("storage unavailable"); },
      async () => { registryDeletes += 1; },
    )).resolves.toBe(false);
    expect(registryDeletes).toBe(0);
    await expect(deleteStoredAttachmentSafely(async () => undefined, async () => { registryDeletes += 1; })).resolves.toBe(true);
    expect(registryDeletes).toBe(1);
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
