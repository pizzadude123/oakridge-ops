import { describe, expect, it } from "vitest";
import {
  analyzeAllocations,
  buildRegistrationTimeline,
  extractAllocationRows,
  groupRegistrationsByPreference,
  mapRegistrationRow,
  recommendAllocations,
  type AllocationCapacity,
  type RegistrationRecord,
} from "./operations";

const registrations: RegistrationRecord[] = [
  {
    id: "a",
    fullName: "Aarav Rao",
    email: "aarav@example.com",
    school: "Oakridge",
    registeredAt: "2026-08-09T09:05:00.000Z",
    paymentStatus: "unpaid",
    preference1: "UNSC",
    preference2: "DISEC",
    preference3: "UNHRC",
  },
  {
    id: "b",
    fullName: "Zara Singh",
    email: "zara@example.com",
    school: "Chirec",
    registeredAt: "2026-08-09T09:25:00.000Z",
    paymentStatus: "reported_paid",
    preference1: "UNSC",
    preference2: "OIC",
    preference3: "DISEC",
  },
  {
    id: "c",
    fullName: "Mira Shah",
    email: "mira@example.com",
    school: "Indus",
    registeredAt: "2026-08-09T11:00:00.000Z",
    paymentStatus: "needs_review",
    preference1: "DISEC",
    preference2: "UNSC",
    preference3: "OIC",
  },
];

describe("mapRegistrationRow", () => {
  it("maps messy Microsoft Forms-style column names", () => {
    const row = mapRegistrationRow({
      "Full Name of Delegate ": "  Aarav Rao  ",
      "Email Address": " AARAV@EXAMPLE.COM ",
      "Name of School": "Oakridge",
      "Submission time": "2026-08-09T09:05:00.000Z",
      "Committee Preference 1": "UNSC",
      "Committee Preference 2": "DISEC",
      "Committee Preference 3": "UNHRC",
      "Payment Status": "Paid",
    }, "row-1");

    expect(row).toMatchObject({
      id: "row-1",
      fullName: "Aarav Rao",
      email: "aarav@example.com",
      school: "Oakridge",
      preference1: "UNSC",
      preference2: "DISEC",
      preference3: "UNHRC",
      paymentStatus: "reported_paid",
    });
  });

  it("keeps payment truth honest when a form only reports paid", () => {
    const row = mapRegistrationRow({ "Full name": "Mira", Payment: "yes" }, "row-2");
    expect(row.paymentStatus).toBe("reported_paid");
    expect(row.paymentStatus).not.toBe("verified_paid");
  });
});

describe("preference comparison", () => {
  it("shows everyone with the same choice in an allocation round", () => {
    const grouped = groupRegistrationsByPreference(registrations, 1);
    expect(grouped.UNSC.map((person) => person.fullName)).toEqual([
      "Aarav Rao",
      "Zara Singh",
    ]);
    expect(grouped.DISEC).toHaveLength(1);
  });

  it("recommends first, then second preference, and never third", () => {
    const capacities: AllocationCapacity[] = [
      { choice: "UNSC", capacity: 1 },
      { choice: "DISEC", capacity: 2 },
      { choice: "OIC", capacity: 0 },
      { choice: "UNHRC", capacity: 10 },
    ];
    const results = recommendAllocations(registrations, capacities);

    expect(results.find((result) => result.registrationId === "a")).toMatchObject({
      choice: "UNSC",
      preferenceRank: 1,
    });
    expect(results.find((result) => result.registrationId === "b")).toMatchObject({
      choice: null,
      preferenceRank: null,
    });
    expect(results.find((result) => result.registrationId === "c")).toMatchObject({
      choice: "DISEC",
      preferenceRank: 1,
    });
    expect(results.every((result) => result.preferenceRank === null || result.preferenceRank <= 2)).toBe(true);
  });
});

describe("real-world allocation sheets", () => {
  it("finds a header after title rows and extracts occupied and vacant seats", () => {
    const rows = extractAllocationRows("DISEC", [
      ["DISEC (Disarmament and International Security Committee)"],
      ["AGENDA", "Something"],
      [],
      ["S. No.", "Allocation", "Delegate Name", "School Name"],
      [1, "United States", "Aarav Rao", "Oakridge"],
      [2, "France", "", ""],
    ]);

    expect(rows).toEqual([
      {
        sheet: "DISEC",
        seatNumber: "1",
        allocation: "United States",
        delegateName: "Aarav Rao",
        schoolName: "Oakridge",
      },
      {
        sheet: "DISEC",
        seatNumber: "2",
        allocation: "France",
        delegateName: "",
        schoolName: "",
      },
    ]);
  });

  it("detects cross-sheet double allocations and missing schools", () => {
    const report = analyzeAllocations([
      { sheet: "DISEC", seatNumber: "1", allocation: "France", delegateName: "Aarav Rao", schoolName: "" },
      { sheet: "UNSC", seatNumber: "3", allocation: "Russia", delegateName: " aarav  rao ", schoolName: "Oakridge" },
      { sheet: "UNSC", seatNumber: "4", allocation: "China", delegateName: "Zara Singh", schoolName: "Chirec" },
    ]);

    expect(report.duplicateDelegates).toHaveLength(1);
    expect(report.duplicateDelegates[0].delegateName).toBe("Aarav Rao");
    expect(report.missingSchools).toHaveLength(1);
    expect(report.vacantSeats).toBe(0);
  });
});

describe("registration timing", () => {
  it("groups registrations into hourly buckets and identifies the peak", () => {
    const timeline = buildRegistrationTimeline(registrations, "hour");
    expect(timeline.points.map((point) => point.count)).toEqual([2, 1]);
    expect(timeline.peak?.count).toBe(2);
  });
});
