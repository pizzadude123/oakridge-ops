import { describe, expect, it } from "vitest";
import { canLinkCrisisAttachment, canManageExperienceRecord, isCrisisAttachmentPublic, nextCrisisUpdateNumber } from "./experienceAccess";

describe("experience authorization", () => {
  it("lets administrators moderate records from any publisher", () => {
    expect(canManageExperienceRecord("administrator", "admin", "publisher")).toBe(true);
  });

  it("limits publishers to their own crisis records", () => {
    expect(canManageExperienceRecord("experience_publisher", "publisher-a", "publisher-a")).toBe(true);
    expect(canManageExperienceRecord("experience_publisher", "publisher-a", "publisher-b")).toBe(false);
  });

  it("allocates the next number from every record in the target channel", () => {
    expect(nextCrisisUpdateNumber([])).toBe(1);
    expect(nextCrisisUpdateNumber([{ updateNumber: 1 }, { updateNumber: 4 }, { updateNumber: 2 }])).toBe(5);
  });

  it("only links a file its publisher can manage and never reuses it across updates", () => {
    expect(canLinkCrisisAttachment("experience_publisher", "publisher-a", "publisher-a")).toBe(true);
    expect(canLinkCrisisAttachment("experience_publisher", "publisher-b", "publisher-a")).toBe(false);
    expect(canLinkCrisisAttachment("administrator", "admin", "publisher-a", "update-1", "update-1")).toBe(true);
    expect(canLinkCrisisAttachment("administrator", "admin", "publisher-a", "update-1", "update-2")).toBe(false);
  });

  it("exposes a file only when its published update owns the link and storage URL", () => {
    expect(isCrisisAttachmentPublic(true, "update-1", "update-1", "https://storage.example/file")).toBe(true);
    expect(isCrisisAttachmentPublic(false, "update-1", "update-1", "https://storage.example/file")).toBe(false);
    expect(isCrisisAttachmentPublic(true, "update-1", undefined, "https://storage.example/file")).toBe(false);
    expect(isCrisisAttachmentPublic(true, "update-1", "update-2", "https://storage.example/file")).toBe(false);
    expect(isCrisisAttachmentPublic(true, "update-1", "update-1", null)).toBe(false);
  });
});
