import { describe, expect, it } from "vitest";
import {
  emailAssetCampaignMaterial,
  inlineImageIdentity,
  isEmailAssetExpired,
  validateEmailAssetOwnerQuota,
  validateEmailAssetBatch,
  validateEmailAssetMetadata,
  validateEmailUploadHeaders,
  validateEmailImageBytes,
} from "./emailAssets";

describe("email image asset validation", () => {
  it("accepts bounded mail-safe image metadata", () => {
    expect(validateEmailAssetMetadata({ contentType: "image/png", size: 850_000 })).toEqual({
      contentType: "image/png",
      size: 850_000,
    });
    expect(validateEmailAssetMetadata({ contentType: "image/jpeg", size: 1_000_000 }).contentType).toBe("image/jpeg");
    expect(validateEmailAssetMetadata({ contentType: "image/gif", size: 42 }).contentType).toBe("image/gif");
  });

  it("rejects unsafe formats and oversized files", () => {
    expect(() => validateEmailAssetMetadata({ contentType: "image/svg+xml", size: 400 })).toThrow("PNG, JPEG, or GIF");
    expect(() => validateEmailAssetMetadata({ contentType: "image/png", size: 1_000_001 })).toThrow("1 MB");
    expect(() => validateEmailAssetMetadata({ contentType: "image/png", size: 0 })).toThrow("empty");
    expect(() => validateEmailAssetBatch([1_000_000, 1_000_000, 1_000_000, 1_000_000])).toThrow("up to 3");
    expect(() => validateEmailAssetBatch([1_000_000, 1_000_000, 1])).toThrow("2 MB total");
  });

  it("rejects oversized or unsupported HTTP uploads before storage", () => {
    expect(() => validateEmailUploadHeaders({ contentLength: "1000001", contentType: "image/png" })).toThrow("1 MB");
    expect(() => validateEmailUploadHeaders({ contentLength: "400", contentType: "image/svg+xml" })).toThrow("PNG, JPEG, or GIF");
    expect(validateEmailUploadHeaders({ contentLength: "1000000", contentType: "image/jpeg; charset=binary" })).toEqual({
      contentType: "image/jpeg",
      declaredSize: 1_000_000,
    });
  });

  it("detects MIME spoofing from file signatures", () => {
    expect(() => validateEmailImageBytes(new Uint8Array([0x3c, 0x73, 0x76, 0x67]), "image/png")).toThrow("does not match");
    expect(validateEmailImageBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")).toBe(true);
    expect(validateEmailImageBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")).toBe(true);
    expect(validateEmailImageBytes(new TextEncoder().encode("GIF89a"), "image/gif")).toBe(true);
  });

  it("generates safe provider identities and includes image order in campaign identity", () => {
    expect(inlineImageIdentity(1, "image/jpeg")).toEqual({
      contentId: "oakridge-image-2",
      fileName: "oakridge-image-2.jpg",
    });
    const first = emailAssetCampaignMaterial([
      { sha256: "aaa", alt: "Opening ceremony" },
      { sha256: "bbb", alt: "Committee session" },
    ]);
    const reordered = emailAssetCampaignMaterial([
      { sha256: "bbb", alt: "Committee session" },
      { sha256: "aaa", alt: "Opening ceremony" },
    ]);
    expect(first).not.toBe(reordered);
    expect(first).toContain("Opening ceremony");
  });

  it("expires abandoned uploads after the retention window", () => {
    const now = 100_000_000;
    expect(isEmailAssetExpired(now - 86_400_000, now)).toBe(true);
    expect(isEmailAssetExpired(now - 86_399_999, now)).toBe(false);
  });

  it("bounds retained assets per owner by count and total bytes", () => {
    expect(() => validateEmailAssetOwnerQuota(
      Array.from({ length: 11 }, () => ({ size: 100_000 })),
      100_000,
    )).not.toThrow();
    expect(() => validateEmailAssetOwnerQuota(
      Array.from({ length: 12 }, () => ({ size: 100_000 })),
      100_000,
    )).toThrow(/12 retained images/);
    expect(() => validateEmailAssetOwnerQuota([{ size: 7_900_000 }], 200_000)).toThrow(/8 MB retained-image limit/);
  });
});
