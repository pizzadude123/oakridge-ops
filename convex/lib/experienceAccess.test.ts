import { describe, expect, it } from "vitest";
import { canManageExperienceRecord, nextCrisisUpdateNumber } from "./experienceAccess";

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
});
