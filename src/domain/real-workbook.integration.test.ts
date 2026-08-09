import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { analyzeAllocations, extractAllocationRows, mapRegistrationRow } from "./operations";

const workbookPath = "/Users/pranay/Downloads/Oakridge MUN 2026 - Allocation Matrix (1).xlsx";
const registrationFixturePath = `${process.cwd()}/public/Oakridge-MUN-Registration-Test.xlsx`;

describe("downloadable registration test kit", () => {
  it("imports as 12 complete Microsoft Forms-style responses", () => {
    const workbook = XLSX.read(readFileSync(registrationFixturePath), { type: "buffer", cellDates: true });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: false })
      .map((row, index) => mapRegistrationRow(row, `fixture-${index + 2}`));

    expect(workbook.SheetNames[0]).toBe("Responses");
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({ responseId: "R-1042", fullName: "Aanya Verma", email: "aanya.verma@example.com", preference1: "DISEC" });
    expect(rows.every((row) => row.fullName && row.email && row.preference1)).toBe(true);
    expect(rows[0].answers).toHaveLength(18);
  });
});

describe("Oakridge's real allocation workbook", () => {
  it.runIf(existsSync(workbookPath))(
    "extracts committee allocations and produces a useful diagnostic report",
    () => {
      const workbook = XLSX.read(readFileSync(workbookPath), { type: "buffer", cellDates: true });
      const rows = workbook.SheetNames.flatMap((sheetName) => {
        const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
          header: 1,
          defval: "",
          raw: false,
        });
        return extractAllocationRows(sheetName, sheetRows);
      });
      const report = analyzeAllocations(rows);

      expect(workbook.SheetNames).toContain("DISEC");
      expect(workbook.SheetNames).toContain("UNSC");
      expect(rows.length).toBeGreaterThan(400);
      expect(report.occupiedSeats).toBeGreaterThan(100);
      expect(report.vacantSeats).toBeGreaterThan(100);
    },
  );
});
