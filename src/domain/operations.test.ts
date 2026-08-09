import { describe, expect, it } from "vitest";
import {
  analyzeAllocations,
  analyzeRegistrationQuality,
  buildPreferenceDemand,
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

  it("preserves response identity, timing, and every submitted field", () => {
    const row = mapRegistrationRow({
      "Response ID": "R-1042",
      "Start time": "2026-08-09T09:00:00.000Z",
      "Completion time": "2026-08-09T09:05:00.000Z",
      "Delegate Full Name": "Aarav Rao",
      "Student Email ID": "aarav@example.com",
      "Committee Preference 1": "DISEC",
      "Country Preference 1": "France",
      "Receipt Number": "26OISS10001",
      "Do you have any questions for us?": "Dietary support",
    }, "row-3");

    expect(row).toMatchObject({
      responseId: "R-1042",
      startedAt: "2026-08-09T09:00:00.000Z",
      submittedAt: "2026-08-09T09:05:00.000Z",
      registeredAt: "2026-08-09T09:05:00.000Z",
    });
    expect(row.answers).toContainEqual({ question: "Country Preference 1", answer: "France" });
    expect(row.answers).toContainEqual({ question: "Receipt Number", answer: "26OISS10001" });
    expect(row.answers).toHaveLength(9);
  });

  it("keeps payment truth honest when a form only reports paid", () => {
    const row = mapRegistrationRow({ "Full name": "Mira", Payment: "yes" }, "row-2");
    expect(row.paymentStatus).toBe("reported_paid");
    expect(row.paymentStatus).not.toBe("verified_paid");
  });

  it("does not confuse parent email or country preference with delegate fields", () => {
    const row = mapRegistrationRow({
      "Parent Email ID": "parent@example.com",
      "Student Email ID": "delegate@example.com",
      "Country Preference 1": "France",
      "Committee Preference 1": "DISEC",
    }, "row-4");
    expect(row.email).toBe("delegate@example.com");
    expect(row.preference1).toBe("DISEC");
  });
});

describe("preference comparison", () => {
  it("combines every rank into one transparent demand model", () => {
    const demand = buildPreferenceDemand(registrations);
    expect(demand.find((choice) => choice.choice === "UNSC")).toMatchObject({
      firstCount: 2,
      secondCount: 1,
      thirdCount: 0,
      uniqueDelegates: 3,
      weightedDemand: 8,
    });
    expect(demand.find((choice) => choice.choice === "DISEC")).toMatchObject({
      firstCount: 1,
      secondCount: 1,
      thirdCount: 1,
      uniqueDelegates: 3,
      weightedDemand: 6,
    });
  });

  it("reports duplicate contacts and incomplete form responses before synchronization", () => {
    const quality = analyzeRegistrationQuality([
      ...registrations,
      { ...registrations[0], id: "duplicate", fullName: "", preference1: "", preference2: "", preference3: "" },
      { ...registrations[0], id: "missing-email", email: "" },
    ]);
    expect(quality).toMatchObject({
      total: 5,
      complete: 3,
      missingNames: 1,
      missingEmails: 1,
      missingPreferences: 1,
      duplicateEmails: ["aarav@example.com"],
    });
  });

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
