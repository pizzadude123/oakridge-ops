import { describe, expect, it } from "vitest";
import { canLinkCrisisAttachment, canManageExperienceRecord, canUseCrisisAttachmentForUpdate, isCrisisAttachmentPublic, nextCrisisUpdateNumber } from "./experienceAccess";

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

  it("allows an update owner to preserve its existing attachment regardless of who uploaded it", () => {
    expect(canUseCrisisAttachmentForUpdate({
      role: "experience_publisher",
      actorId: "publisher-a",
      attachmentId: "attachment-1",
      attachmentOwnerId: "admin",
      attachmentUpdateId: "update-1",
      targetUpdateId: "update-1",
      existingAttachmentId: "attachment-1",
    })).toBe(true);
    expect(canUseCrisisAttachmentForUpdate({
      role: "experience_publisher",
      actorId: "publisher-a",
      attachmentId: "attachment-2",
      attachmentOwnerId: "publisher-b",
      targetUpdateId: "update-1",
      existingAttachmentId: "attachment-1",
    })).toBe(false);
  });

  it("exposes metadata only when its published update owns the link", () => {
    expect(isCrisisAttachmentPublic(true, "update-1", "update-1")).toBe(true);
    expect(isCrisisAttachmentPublic(false, "update-1", "update-1")).toBe(false);
    expect(isCrisisAttachmentPublic(true, "update-1", undefined)).toBe(false);
    expect(isCrisisAttachmentPublic(true, "update-1", "update-2")).toBe(false);
  });
});
