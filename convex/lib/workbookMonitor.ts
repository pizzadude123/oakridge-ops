import {
  analyzeAllocations,
  type AllocationRow,
} from "../../src/domain/operations";

export type WorkbookIssue = {
  key: string;
  type: "Double allocation" | "Duplicate seat" | "School missing";
  severity: "error" | "warning";
  delegate: string;
  location: string;
  action: string;
};

export type WorkbookSnapshot = {
  summary: {
    totalSeats: number;
    occupiedSeats: number;
    vacantSeats: number;
    issueCount: number;
  };
  issues: WorkbookIssue[];
};

function normalizeKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function encodeGraphShareUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") throw new Error("Use an HTTPS OneDrive or SharePoint workbook link.");
  return `u!${Buffer.from(url.toString(), "utf8").toString("base64url")}`;
}

export function buildWorkbookSnapshot(rows: AllocationRow[]): WorkbookSnapshot {
  const report = analyzeAllocations(rows);
  const issues: WorkbookIssue[] = [
    ...report.duplicateDelegates.map((issue) => {
      const location = issue.occurrences
        .map((row) => `${row.sheet}: ${row.allocation}`)
        .sort()
        .join(" · ");
      return {
        key: `double-allocation::${normalizeKey(issue.delegateName)}`,
        type: "Double allocation" as const,
        severity: "error" as const,
        delegate: issue.delegateName,
        location,
        action: "Keep one allocation and remove the other.",
      };
    }),
    ...report.duplicateSeats.map((issue) => {
      const delegate = issue.occurrences
        .map((row) => row.delegateName || "Vacant")
        .sort()
        .join(" / ");
      const location = issue.occurrences
        .map((row) => `${row.sheet}: ${row.allocation}`)
        .sort()
        .join(" · ");
      return {
        key: `duplicate-seat::${normalizeKey(issue.key)}`,
        type: "Duplicate seat" as const,
        severity: "error" as const,
        delegate,
        location,
        action: "Make each committee seat unique.",
      };
    }),
    ...report.missingSchools.map((row) => ({
      key: `missing-school::${normalizeKey(row.sheet)}::${normalizeKey(row.allocation)}::${normalizeKey(row.delegateName)}`,
      type: "School missing" as const,
      severity: "warning" as const,
      delegate: row.delegateName,
      location: `${row.sheet}: ${row.allocation}`,
      action: "Add the delegate’s school name.",
    })),
  ].sort((left, right) => left.key.localeCompare(right.key));

  return {
    summary: {
      totalSeats: report.totalSeats,
      occupiedSeats: report.occupiedSeats,
      vacantSeats: report.vacantSeats,
      issueCount: issues.length,
    },
    issues,
  };
}

export function diffWorkbookIssueKeys(previousKeys: string[], currentKeys: string[]) {
  const previous = new Set(previousKeys);
  const current = new Set(currentKeys);
  return {
    newKeys: currentKeys.filter((key) => !previous.has(key)),
    resolvedKeys: previousKeys.filter((key) => !current.has(key)),
    ongoingKeys: currentKeys.filter((key) => previous.has(key)),
  };
}
