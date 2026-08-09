import * as XLSX from "xlsx";
import {
  extractAllocationRows,
  mapRegistrationRow,
  type AllocationRow,
  type RegistrationRecord,
} from "../domain/operations";
import { normalizePeopleRows, type PeopleImportResult } from "../domain/people";

async function readWorkbook(file: File) {
  const data = await file.arrayBuffer();
  return XLSX.read(data, { type: "array", cellDates: true });
}

export async function parseRegistrationFile(file: File): Promise<RegistrationRecord[]> {
  const workbook = await readWorkbook(file);
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error("The file does not contain a worksheet.");
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    defval: "",
    raw: false,
  });
  const rows = rawRows
    .map((row, index) => mapRegistrationRow(row, `row-${index + 2}`))
    .filter((row) => row.fullName || row.email || row.preference1);
  if (rows.length === 0) {
    throw new Error("No registration rows were found. Check that the first row contains column headings.");
  }
  return rows;
}

export async function parsePeopleFile(file: File): Promise<PeopleImportResult> {
  const workbook = await readWorkbook(file);
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error("The file does not contain a worksheet.");
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "", raw: false });
  const result = normalizePeopleRows(rawRows);
  if (!result.people.length) {
    throw new Error("No valid people were found. Include a Name and Email column in the first worksheet.");
  }
  return result;
}

export async function parseAllocationFile(file: File): Promise<AllocationRow[]> {
  const workbook = await readWorkbook(file);
  const rows = workbook.SheetNames.flatMap((sheetName) => {
    const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: false,
    });
    return extractAllocationRows(sheetName, sheetRows);
  });
  if (rows.length === 0) {
    throw new Error("No committee allocation tables were found. The file needs Allocation and Delegate Name headings.");
  }
  return rows;
}

export function downloadCsv(fileName: string, rows: Record<string, string | number>[]) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(sheet);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
