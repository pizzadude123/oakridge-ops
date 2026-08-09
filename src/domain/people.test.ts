import { describe, expect, it } from "vitest";
import { normalizePeopleRows } from "./people";

describe("normalizePeopleRows", () => {
  it("imports and deduplicates Microsoft Forms-style name and email rows", () => {
    const result = normalizePeopleRows([
      { "Full Name": "Aarav Rao", "Email Address": " AARAV@example.com ", School: "Oakridge" },
      { Name: "Duplicate Aarav", Email: "aarav@example.com", School: "" },
      { "Responder's Email": "mira@example.com", "Participant name": "Mira Shah", Organisation: "Greenwood" },
      { Name: "No email" },
    ]);

    expect(result.people).toEqual([
      { fullName: "Aarav Rao", email: "aarav@example.com", school: "Oakridge" },
      { fullName: "Mira Shah", email: "mira@example.com", school: "Greenwood" },
    ]);
    expect(result.skippedRows).toBe(2);
  });

  it("derives a readable name when a valid row contains only an email", () => {
    const result = normalizePeopleRows([{ Email: "pranay.immadi@example.com" }]);
    expect(result.people[0]?.fullName).toBe("Pranay Immadi");
  });
});
