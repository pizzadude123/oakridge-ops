import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { analyzeAllocations, extractAllocationRows } from "./operations";

const workbookPath = "/Users/pranay/Downloads/Oakridge MUN 2026 - Allocation Matrix (1).xlsx";

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
