import { inflateSync } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";

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

const OFFICE_PACKAGE_MAX_ENTRIES = 4_096;
export const OFFICE_PACKAGE_MAX_EXPANDED_BYTES = 100_000_000;

export function addOfficeExpandedBytes(current: number, next: number) {
  const total = current + next;
  if (!Number.isSafeInteger(total) || next < 0 || total > OFFICE_PACKAGE_MAX_EXPANDED_BYTES) {
    throw new Error("The Office package expands beyond the safe processing limit.");
  }
  return total;
}

function findZipEnd(bytes: Uint8Array) {
  if (bytes.length < 22) throw new Error("The uploaded file is not a valid Office package.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const firstPossible = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= firstPossible; offset -= 1) {
    if (view.getUint32(offset, true) !== 0x06054b50) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + 22 + commentLength === bytes.length) return offset;
  }
  throw new Error("The uploaded file is not a valid Office package.");
}

type OfficePackageEntry = { compressed: Uint8Array; compressionMethod: number; crc32: number; expandedSize: number };

function officePackageEntries(bytes: Uint8Array) {
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) throw new Error("The uploaded file is not a valid Office package.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findZipEnd(bytes);
  const disk = view.getUint16(endOffset + 4, true);
  const centralDisk = view.getUint16(endOffset + 6, true);
  const diskEntries = view.getUint16(endOffset + 8, true);
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount || entryCount === 0 || entryCount > OFFICE_PACKAGE_MAX_ENTRIES
    || centralOffset === 0xffffffff || centralSize === 0xffffffff || centralOffset + centralSize > endOffset) {
    throw new Error("The uploaded file is not a valid Office package.");
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const entries = new Map<string, OfficePackageEntry>();
  let expandedBytes = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > endOffset || view.getUint32(offset, true) !== 0x02014b50) throw new Error("The uploaded file is not a valid Office package.");
    const flags = view.getUint16(offset + 8, true);
    const compressionMethod = view.getUint16(offset + 10, true);
    const crc32 = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const expandedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > endOffset || localOffset + 30 > centralOffset || view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("The uploaded file is not a valid Office package.");
    if ((flags & 0x0001) !== 0) throw new Error("Encrypted Office packages cannot be published.");
    if ((flags & 0x0008) !== 0 || ![0, 8].includes(compressionMethod) || compressedSize === 0xffffffff || expandedSize === 0xffffffff || localOffset === 0xffffffff) throw new Error("The uploaded file uses an unsupported Office package layout.");
    let name: string;
    try { name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)).replaceAll("\\", "/"); } catch { throw new Error("The uploaded file is not a valid Office package."); }
    if (!name || name.startsWith("/") || name.includes("\u0000") || /(^|\/)\.\.(\/|$)/.test(name)) throw new Error("The Office package contains an unsafe path.");
    const normalized = name.toLowerCase();
    if (entries.has(normalized)) throw new Error("The uploaded file is not a valid Office package.");
    if (normalized.endsWith("vbaproject.bin") || normalized.includes("/activex/") || normalized.includes("/embeddings/") || normalized.includes("/customui/")) throw new Error("Office packages with macros or active content cannot be published.");
    if (/\.(?:bin|exe|dll|com|msi|js|vbs|ps1|scr)$/i.test(normalized)) {
      throw new Error("Office packages with executable or binary parts cannot be published.");
    }
    expandedBytes = addOfficeExpandedBytes(expandedBytes, expandedSize);
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const localCrc32 = view.getUint32(localOffset + 14, true);
    const localCompressedSize = view.getUint32(localOffset + 18, true);
    const localExpandedSize = view.getUint32(localOffset + 22, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataOffset + compressedSize;
    if (localFlags !== flags || localMethod !== compressionMethod || localCrc32 !== crc32 || localCompressedSize !== compressedSize || localExpandedSize !== expandedSize || dataOffset > centralOffset || dataEnd > centralOffset) throw new Error("The uploaded file is not a valid Office package.");
    let localName: string;
    try { localName = decoder.decode(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength)).replaceAll("\\", "/").toLowerCase(); } catch { throw new Error("The uploaded file is not a valid Office package."); }
    if (localName !== normalized) throw new Error("The uploaded file is not a valid Office package.");
    entries.set(normalized, { compressed: bytes.slice(dataOffset, dataEnd), compressionMethod, crc32, expandedSize });
    offset = nextOffset;
  }
  if (offset !== centralOffset + centralSize) throw new Error("The uploaded file is not a valid Office package.");
  return entries;
}

const officeXmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true });

export function officeCrc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function expandOfficeEntry(entry: OfficePackageEntry) {
  let expanded: Uint8Array;
  if (entry.compressionMethod === 0) expanded = entry.compressed;
  else {
    try { expanded = inflateSync(entry.compressed, { out: new Uint8Array(entry.expandedSize) }); }
    catch { throw new Error("The uploaded file contains invalid compressed Office content."); }
  }
  if (expanded.byteLength !== entry.expandedSize || officeCrc32(expanded) !== entry.crc32) {
    throw new Error("The uploaded file contains corrupt Office package content.");
  }
  return expanded;
}

function parseOfficeXml(entry: OfficePackageEntry | undefined, rootName: string) {
  if (!entry || entry.expandedSize <= 0 || entry.expandedSize > 5_000_000) throw new Error("The uploaded file is missing required Office XML content.");
  const expanded = expandOfficeEntry(entry);
  let xml: string;
  try { xml = new TextDecoder("utf-8", { fatal: true }).decode(expanded).replace(/^\uFEFF/, "").trim(); }
  catch { throw new Error("The uploaded file contains invalid Office XML."); }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error("The uploaded file contains malformed or unsafe Office XML.");
  let parsed: Record<string, unknown>;
  try { parsed = officeXmlParser.parse(xml) as Record<string, unknown>; }
  catch { throw new Error("The uploaded file contains malformed Office XML."); }
  if (!parsed[rootName] || typeof parsed[rootName] !== "object") throw new Error("The uploaded file is missing required Office XML structure.");
  return parsed[rootName] as Record<string, unknown>;
}

function collectObjects(value: unknown, key: string, output: Array<Record<string, unknown>> = []) {
  if (!value || typeof value !== "object") return output;
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    if (childKey === key) {
      const values = Array.isArray(childValue) ? childValue : [childValue];
      for (const item of values) if (item && typeof item === "object") output.push(item as Record<string, unknown>);
    }
    collectObjects(childValue, key, output);
  }
  return output;
}

function decodeXmlAttribute(value: unknown) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&(?:quot|apos|lt|gt|amp);/g, (entity) => ({
      "&quot;": "\"", "&apos;": "'", "&lt;": "<", "&gt;": ">", "&amp;": "&",
    })[entity] ?? entity);
}

function assertSafeRelationships(root: Record<string, unknown>) {
  const unsafeType = /(?:activex|oleobject|vbaproject|attachedtemplate|relationships\/package)/i;
  for (const relationship of collectObjects(root, "Relationship")) {
    const type = decodeXmlAttribute(relationship["@_Type"]);
    const targetMode = decodeXmlAttribute(relationship["@_TargetMode"]);
    if (unsafeType.test(type) || targetMode.toLowerCase() === "external") {
      throw new Error("Office packages with active or external content cannot be published.");
    }
  }
}

export function validateCrisisAttachmentFileName(value: string, contentType: CrisisAttachmentContentType) {
  const hasUnsafeControlCharacter = Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f
      || (codePoint >= 0x7f && codePoint <= 0x9f)
      || (codePoint >= 0x202a && codePoint <= 0x202e)
      || (codePoint >= 0x2066 && codePoint <= 0x2069);
  });
  if (hasUnsafeControlCharacter) {
    throw new Error("Attachment filenames cannot contain control characters.");
  }
  const fileName = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!fileName || fileName.length > 180 || fileName.includes("/") || fileName.includes("\\")) {
    throw new Error("Use a filename between 1 and 180 characters without path separators.");
  }
  const extensions: Record<CrisisAttachmentContentType, string[]> = {
    "application/pdf": [".pdf"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    "text/csv": [".csv"],
    "image/png": [".png"],
    "image/jpeg": [".jpg", ".jpeg"],
  };
  if (!extensions[contentType].some((extension) => fileName.toLowerCase().endsWith(extension))) {
    const expected = extensions[contentType].map((extension) => extension.slice(1).toUpperCase()).join(" or ");
    throw new Error(`The filename must use the ${expected} extension for its verified file type.`);
  }
  return fileName;
}

export async function readStreamWithLimit(stream: ReadableStream<Uint8Array> | null, maxBytes = MAX_CRISIS_ATTACHMENT_BYTES) {
  if (!stream) throw new Error("The attachment is empty.");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      if (total + value.byteLength > maxBytes) {
        await reader.cancel();
        throw new Error("Crisis attachments must be 10 MB or smaller.");
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function deleteStoredAttachmentSafely(deleteStorage: () => Promise<unknown>, deleteRegistry: () => Promise<unknown>) {
  try {
    await deleteStorage();
  } catch {
    return false;
  }
  await deleteRegistry();
  return true;
}

export async function validateCrisisAttachmentBytes(bytes: Uint8Array, contentType: CrisisAttachmentContentType) {
  const officeEntries = contentType.includes("openxmlformats") ? officePackageEntries(bytes) : null;
  let safeOfficePackage = false;
  if (officeEntries) {
    for (const [name, entry] of officeEntries) {
      if (!/\.(?:xml|rels|png|jpe?g|gif|bmp|svg|emf|wmf|tiff?|odttf)$/i.test(name)) {
        throw new Error("The Office package contains an unexplained binary part.");
      }
      const expanded = expandOfficeEntry(entry);
      const executableSignature = startsWith(expanded, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
        || startsWith(expanded, [0x4d, 0x5a])
        || startsWith(expanded, [0x7f, 0x45, 0x4c, 0x46])
        || startsWith(expanded, [0x50, 0x4b, 0x03, 0x04])
        || startsWith(expanded, [0xca, 0xfe, 0xba, 0xbe])
        || startsWith(expanded, [0xcf, 0xfa, 0xed, 0xfe]);
      const prefix = new TextDecoder("utf-8").decode(expanded.subarray(0, 256)).trimStart().toLowerCase();
      if (executableSignature || prefix.startsWith("#!") || prefix.startsWith("<script")) {
        throw new Error("Office packages with executable or embedded binary content cannot be published.");
      }
    }
    const contentTypes = parseOfficeXml(officeEntries.get("[content_types].xml"), "Types");
    const relationships = parseOfficeXml(officeEntries.get("_rels/.rels"), "Relationships");
    const unsafeContentType = /(?:macroenabled|vbaproject|activex|oleobject|application\/vnd\.ms-office)/i;
    for (const item of [...collectObjects(contentTypes, "Default"), ...collectObjects(contentTypes, "Override")]) {
      if (unsafeContentType.test(decodeXmlAttribute(item["@_ContentType"]))) {
        throw new Error("Office packages with active content cannot be published.");
      }
    }
    assertSafeRelationships(relationships);
    for (const [name, entry] of officeEntries) {
      if (!name.endsWith(".rels") || name === "_rels/.rels") continue;
      assertSafeRelationships(parseOfficeXml(entry, "Relationships"));
    }
    if (contentType.includes("wordprocessingml")) parseOfficeXml(officeEntries.get("word/document.xml"), "document");
    else parseOfficeXml(officeEntries.get("xl/workbook.xml"), "workbook");
    safeOfficePackage = true;
  }
  const valid = contentType === "application/pdf"
    ? startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])
    : contentType === "image/png"
      ? startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      : contentType === "image/jpeg"
        ? startsWith(bytes, [0xff, 0xd8, 0xff])
        : contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          ? safeOfficePackage
          : contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ? safeOfficePackage
            : contentType === "text/csv"
              ? isUtf8Text(bytes)
              : false;
  if (!valid) throw new Error(`The uploaded file does not match its declared ${contentType} type.`);
  return true;
}
