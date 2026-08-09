import { describe, expect, it } from "vitest";
import type { AllocationRow } from "../../src/domain/operations";
import {
  buildWorkbookSnapshot,
  diffWorkbookIssueKeys,
  encodeGraphShareUrl,
} from "./workbookMonitor";

const baseRows: AllocationRow[] = [
  { sheet: "DISEC", seatNumber: "1", allocation: "France", delegateName: "Aarav Rao", schoolName: "Oakridge" },
  { sheet: "UNSC", seatNumber: "2", allocation: "Japan", delegateName: "Aarav Rao", schoolName: "Oakridge" },
  { sheet: "UNHRC", seatNumber: "3", allocation: "Brazil", delegateName: "Mira Shah", schoolName: "" },
  { sheet: "UNHRC", seatNumber: "4", allocation: "Brazil", delegateName: "Kabir Mehta", schoolName: "Oakridge" },
];

describe("encodeGraphShareUrl", () => {
  it("encodes an HTTPS OneDrive share URL for the Graph shares endpoint", () => {
    const url = "https://contoso-my.sharepoint.com/:x:/g/personal/user/example?e=abc123";
    const encoded = encodeGraphShareUrl(url);

    expect(encoded).toMatch(/^u![A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain("=");
    expect(Buffer.from(encoded.slice(2).replaceAll("-", "+").replaceAll("_", "/"), "base64").toString("utf8")).toBe(url);
  });

  it("rejects non-HTTPS workbook links", () => {
    expect(() => encodeGraphShareUrl("http://example.com/workbook.xlsx")).toThrow(/HTTPS/);
  });
});

describe("buildWorkbookSnapshot", () => {
  it("creates stable actionable issues from allocation rows", () => {
    const snapshot = buildWorkbookSnapshot(baseRows);

    expect(snapshot.summary).toEqual({ totalSeats: 4, occupiedSeats: 4, vacantSeats: 0, issueCount: 3 });
    expect(snapshot.issues.map((issue) => issue.type).sort()).toEqual([
      "Double allocation",
      "Duplicate seat",
      "School missing",
    ]);
    expect(new Set(snapshot.issues.map((issue) => issue.key)).size).toBe(3);
  });
});

describe("diffWorkbookIssueKeys", () => {
  it("reports only genuinely new and resolved issue keys", () => {
    const issues = buildWorkbookSnapshot(baseRows).issues;
    const currentKeys = issues.map((issue) => issue.key);
    const previousKeys = [currentKeys[0], "missing-school::resolved-person"];

    expect(diffWorkbookIssueKeys(previousKeys, currentKeys)).toEqual({
      newKeys: currentKeys.slice(1),
      resolvedKeys: ["missing-school::resolved-person"],
      ongoingKeys: [currentKeys[0]],
    });
  });
});
