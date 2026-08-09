import { describe, expect, it } from "vitest";
import { emailAssetUploadEndpoint, formatImageSize, validateSelectedEmailImages } from "./emailAssets";

function file(name: string, type: string, size: number) {
  return { name, type, size };
}

describe("email image selection", () => {
  it("targets the authenticated HTTP-action origin for cloud and local deployments", () => {
    expect(emailAssetUploadEndpoint("https://first-echidna-899.convex.cloud", "committee photo.png"))
      .toBe("https://first-echidna-899.convex.site/email-assets/upload?filename=committee+photo.png");
    expect(emailAssetUploadEndpoint("http://127.0.0.1:3210", "logo.png"))
      .toBe("http://127.0.0.1:3211/email-assets/upload?filename=logo.png");
  });

  it("accepts mail-safe files within the remaining campaign limits", () => {
    const selected = validateSelectedEmailImages({
      existingSizes: [300_000],
      files: [file("committee.png", "image/png", 700_000), file("delegates.jpg", "image/jpeg", 800_000)],
    });
    expect(selected).toHaveLength(2);
    expect(formatImageSize(1_250_000)).toBe("1.3 MB");
  });

  it("rejects unsupported, oversized, excessive, and over-total selections", () => {
    expect(() => validateSelectedEmailImages({ existingSizes: [], files: [file("vector.svg", "image/svg+xml", 300)] })).toThrow("PNG, JPEG, or GIF");
    expect(() => validateSelectedEmailImages({ existingSizes: [], files: [file("huge.png", "image/png", 1_000_001)] })).toThrow("1 MB");
    expect(() => validateSelectedEmailImages({ existingSizes: [100], files: [file("a.png", "image/png", 100), file("b.png", "image/png", 100), file("c.png", "image/png", 100)] })).toThrow("up to 3");
    expect(() => validateSelectedEmailImages({ existingSizes: [1_000_000, 500_000], files: [file("c.png", "image/png", 500_001)] })).toThrow("2 MB total");
  });
});
