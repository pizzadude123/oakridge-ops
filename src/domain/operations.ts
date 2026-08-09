export type PaymentStatus =
  | "reported_paid"
  | "unpaid"
  | "pending"
  | "needs_review";

export type RegistrationRecord = {
  id: string;
  fullName: string;
  email: string;
  school: string;
  registeredAt: string;
  paymentStatus: PaymentStatus;
  preference1: string;
  preference2: string;
  preference3: string;
};

export type AllocationCapacity = {
  choice: string;
  capacity: number;
};

export type AllocationRecommendation = {
  registrationId: string;
  fullName: string;
  choice: string | null;
  preferenceRank: 1 | 2 | null;
  reason: string;
};

export type AllocationRow = {
  sheet: string;
  seatNumber: string;
  allocation: string;
  delegateName: string;
  schoolName: string;
};

export type DuplicateDelegate = {
  delegateName: string;
  occurrences: AllocationRow[];
};

export type AllocationAnalysis = {
  totalSeats: number;
  occupiedSeats: number;
  vacantSeats: number;
  duplicateDelegates: DuplicateDelegate[];
  duplicateSeats: { key: string; occurrences: AllocationRow[] }[];
  missingSchools: AllocationRow[];
};

export type TimelinePoint = {
  key: string;
  label: string;
  count: number;
};

export type RegistrationTimeline = {
  points: TimelinePoint[];
  peak: TimelinePoint | null;
  quietest: TimelinePoint | null;
};

type RawRow = Record<string, unknown>;

function clean(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalize(value: unknown): string {
  return clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function findValue(row: RawRow, predicate: (normalizedHeader: string) => boolean): string {
  const match = Object.entries(row).find(([header]) => predicate(normalize(header)));
  return clean(match?.[1]);
}

function normalizePayment(value: string): PaymentStatus {
  const normalized = normalize(value);
  if (["paid", "yes", "paymentdone", "completed", "submitted"].includes(normalized)) {
    return "reported_paid";
  }
  if (["no", "unpaid", "notpaid", "paymentnotdone"].includes(normalized)) {
    return "unpaid";
  }
  if (["pending", "processing", "awaiting"].includes(normalized)) {
    return "pending";
  }
  return "needs_review";
}

function preferenceMatcher(rank: 1 | 2 | 3) {
  const words = rank === 1 ? ["first", "1"] : rank === 2 ? ["second", "2"] : ["third", "3"];
  return (header: string) =>
    (header.includes("preference") || header.includes("choice")) &&
    words.some((word) => header.includes(word));
}

export function mapRegistrationRow(row: RawRow, id: string): RegistrationRecord {
  const fullName = findValue(
    row,
    (header) =>
      header.includes("fullname") ||
      header.includes("delegatename") ||
      header === "name",
  );
  const email = findValue(row, (header) => header.includes("email")).toLocaleLowerCase();
  const school = findValue(row, (header) => header.includes("school"));
  const registeredAt = findValue(
    row,
    (header) =>
      header.includes("submissiontime") ||
      header.includes("timestamp") ||
      header.includes("completiontime") ||
      header === "registeredat",
  );
  const payment = findValue(
    row,
    (header) => header.includes("payment") && !header.includes("email"),
  );

  return {
    id,
    fullName,
    email,
    school,
    registeredAt,
    paymentStatus: normalizePayment(payment),
    preference1: findValue(row, preferenceMatcher(1)),
    preference2: findValue(row, preferenceMatcher(2)),
    preference3: findValue(row, preferenceMatcher(3)),
  };
}

export function groupRegistrationsByPreference(
  registrations: RegistrationRecord[],
  round: 1 | 2 | 3,
): Record<string, RegistrationRecord[]> {
  const field = `preference${round}` as const;
  return registrations.reduce<Record<string, RegistrationRecord[]>>((groups, registration) => {
    const choice = clean(registration[field]);
    if (!choice) return groups;
    (groups[choice] ??= []).push(registration);
    return groups;
  }, {});
}

export function recommendAllocations(
  registrations: RegistrationRecord[],
  capacities: AllocationCapacity[],
): AllocationRecommendation[] {
  const remaining = new Map(
    capacities.map(({ choice, capacity }) => [normalize(choice), Math.max(0, capacity)]),
  );
  const ordered = registrations
    .map((registration, index) => ({ registration, index }))
    .sort((left, right) => {
      const leftTime = Date.parse(left.registration.registeredAt);
      const rightTime = Date.parse(right.registration.registeredAt);
      if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return left.index - right.index;
      if (Number.isNaN(leftTime)) return 1;
      if (Number.isNaN(rightTime)) return -1;
      return leftTime - rightTime || left.index - right.index;
    });

  const byId = new Map<string, AllocationRecommendation>();
  for (const { registration } of ordered) {
    const preferences: [string, 1 | 2][] = [
      [clean(registration.preference1), 1],
      [clean(registration.preference2), 2],
    ];
    const selected = preferences.find(([choice]) => {
      if (!choice) return false;
      return (remaining.get(normalize(choice)) ?? 0) > 0;
    });

    if (!selected) {
      byId.set(registration.id, {
        registrationId: registration.id,
        fullName: registration.fullName,
        choice: null,
        preferenceRank: null,
        reason: "No first- or second-preference capacity is available. Third preference was not used.",
      });
      continue;
    }

    const [choice, preferenceRank] = selected;
    const capacityKey = normalize(choice);
    remaining.set(capacityKey, (remaining.get(capacityKey) ?? 0) - 1);
    byId.set(registration.id, {
      registrationId: registration.id,
      fullName: registration.fullName,
      choice,
      preferenceRank,
      reason: `Available ${preferenceRank === 1 ? "first" : "second"} preference.`,
    });
  }

  return registrations.map((registration) => byId.get(registration.id)!);
}

function headerIndex(headers: unknown[], candidates: string[]): number {
  return headers.findIndex((header) => {
    const normalized = normalize(header);
    return candidates.some((candidate) => normalized === candidate || normalized.includes(candidate));
  });
}

export function extractAllocationRows(sheet: string, rows: unknown[][]): AllocationRow[] {
  const headerRowIndex = rows.slice(0, 40).findIndex((row) => {
    const headers = row.map(normalize);
    const hasDelegate = headers.some((header) => header.includes("delegatename"));
    const hasSeat = headers.some(
      (header) => header.includes("allocation") || header.includes("portfolio"),
    );
    return hasDelegate && hasSeat;
  });
  if (headerRowIndex < 0) return [];

  const headers = rows[headerRowIndex];
  const delegateIndex = headerIndex(headers, ["delegatename"]);
  const schoolIndex = headerIndex(headers, ["schoolname", "school"]);
  const allocationIndex = headerIndex(headers, ["allocation"]);
  const portfolioIndex = headerIndex(headers, ["portfolio"]);
  const parliamentarianIndex = headerIndex(headers, ["parliamentarian"]);
  const seatIndex = headerIndex(headers, ["sno", "sn"]);

  return rows.slice(headerRowIndex + 1).flatMap<AllocationRow>((row) => {
    const seatNumber = clean(row[seatIndex >= 0 ? seatIndex : 0]);
    if (!/^\d+(?:\.0+)?$/.test(seatNumber)) return [];

    const allocationParts =
      allocationIndex >= 0
        ? [clean(row[allocationIndex])]
        : [clean(row[portfolioIndex]), clean(row[parliamentarianIndex])];
    const allocation = allocationParts.filter(Boolean).join(" — ");
    const delegateName = clean(row[delegateIndex]);
    const schoolName = schoolIndex >= 0 ? clean(row[schoolIndex]) : "";
    if (!allocation && !delegateName) return [];

    return [
      {
        sheet,
        seatNumber: seatNumber.replace(/\.0+$/, ""),
        allocation,
        delegateName,
        schoolName,
      },
    ];
  });
}

function groupBy<T>(items: T[], keyFor: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    if (!key) continue;
    const existing = groups.get(key) ?? [];
    existing.push(item);
    groups.set(key, existing);
  }
  return groups;
}

export function analyzeAllocations(rows: AllocationRow[]): AllocationAnalysis {
  const occupied = rows.filter((row) => clean(row.delegateName));
  const duplicateDelegates = [...groupBy(occupied, (row) => normalize(row.delegateName)).values()]
    .filter((occurrences) => occurrences.length > 1)
    .map((occurrences) => ({
      delegateName: clean(occurrences[0].delegateName),
      occurrences,
    }));
  const duplicateSeats = [
    ...groupBy(rows, (row) => `${normalize(row.sheet)}::${normalize(row.allocation)}`).entries(),
  ]
    .filter(([, occurrences]) => occurrences.length > 1)
    .map(([key, occurrences]) => ({ key, occurrences }));

  return {
    totalSeats: rows.length,
    occupiedSeats: occupied.length,
    vacantSeats: rows.length - occupied.length,
    duplicateDelegates,
    duplicateSeats,
    missingSchools: occupied.filter((row) => !clean(row.schoolName)),
  };
}

export function buildRegistrationTimeline(
  registrations: RegistrationRecord[],
  granularity: "hour" | "day",
): RegistrationTimeline {
  const counts = new Map<string, number>();
  for (const registration of registrations) {
    const date = new Date(registration.registeredAt);
    if (Number.isNaN(date.getTime())) continue;
    const key =
      granularity === "hour"
        ? `${date.toISOString().slice(0, 13)}:00:00.000Z`
        : `${date.toISOString().slice(0, 10)}T00:00:00.000Z`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const points = [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => ({
      key,
      label: new Intl.DateTimeFormat("en-IN", {
        month: "short",
        day: "numeric",
        ...(granularity === "hour" ? { hour: "numeric" as const } : {}),
        timeZone: "UTC",
      }).format(new Date(key)),
      count,
    }));

  const peak = points.reduce<TimelinePoint | null>(
    (best, point) => (!best || point.count > best.count ? point : best),
    null,
  );
  const quietest = points.reduce<TimelinePoint | null>(
    (best, point) => (!best || point.count < best.count ? point : best),
    null,
  );

  return { points, peak, quietest };
}
