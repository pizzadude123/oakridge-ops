import { describe, expect, it } from "vitest";
import { routeInboxSubject } from "./graphRouting";

const rules = [
  { name: "Finance", department: "Finance", keywords: ["payment", "receipt"], recipients: ["finance@example.com"], enabled: true, priority: 10 },
  { name: "Urgent refund", department: "Leadership", keywords: ["urgent refund"], recipients: ["lead@example.com"], enabled: true, priority: 30 },
  { name: "Disabled", department: "Other", keywords: ["allocation"], recipients: [], enabled: false, priority: 100 },
];

describe("routeInboxSubject", () => {
  it("matches subjects without case sensitivity", () => {
    expect(routeInboxSubject("PAYMENT receipt for Oakridge", rules)?.department).toBe("Finance");
  });

  it("prefers the highest-priority matching rule", () => {
    expect(routeInboxSubject("Urgent refund and payment", rules)?.department).toBe("Leadership");
  });

  it("ignores disabled rules and returns null when nothing matches", () => {
    expect(routeInboxSubject("Allocation question", rules)).toBeNull();
  });
});
