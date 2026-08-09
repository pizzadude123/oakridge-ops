import { describe, expect, it } from "vitest";
import { canClaimProviderDelivery, canManuallyChangeStatus } from "./mailDelivery";

describe("provider delivery claim policy", () => {
  it("claims new and explicitly failed deliveries only", () => {
    expect(canClaimProviderDelivery(undefined)).toBe(true);
    expect(canClaimProviderDelivery("failed")).toBe(true);
    expect(canClaimProviderDelivery("sending")).toBe(false);
    expect(canClaimProviderDelivery("accepted")).toBe(false);
    expect(canClaimProviderDelivery("unknown")).toBe(false);
    expect(canClaimProviderDelivery("sent")).toBe(false);
  });
});

describe("manual email history transitions", () => {
  it("allows manual status changes only for Gmail compose drafts", () => {
    expect(canManuallyChangeStatus("gmail_compose", "opened_in_gmail")).toBe(true);
    expect(canManuallyChangeStatus("gmail_compose", "sent")).toBe(true);
    expect(canManuallyChangeStatus("google_gmail", "sent")).toBe(false);
    expect(canManuallyChangeStatus("microsoft_graph", "sent")).toBe(false);
  });
});
