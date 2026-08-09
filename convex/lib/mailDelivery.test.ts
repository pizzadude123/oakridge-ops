import { describe, expect, it } from "vitest";
import {
  canClaimProviderDelivery,
  canManuallyChangeStatus,
  classifyProviderHttpFailure,
  providerCampaignMaterial,
  providerConnectionRedirect,
  providerRetryAction,
  readResponseTextSafely,
  shouldRequireReauthorization,
  summarizeProviderDelivery,
  summarizeProviderDeliveryInterruption,
} from "./mailDelivery";

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

describe("provider response safety", () => {
  it("retries only definitive HTTP rejections and quarantines ambiguous outcomes", () => {
    expect(classifyProviderHttpFailure(400)).toBe("failed");
    expect(classifyProviderHttpFailure(401)).toBe("failed");
    expect(classifyProviderHttpFailure(429)).toBe("failed");
    expect(classifyProviderHttpFailure(408)).toBe("unknown");
    expect(classifyProviderHttpFailure(500)).toBe("unknown");
    expect(classifyProviderHttpFailure(503)).toBe("unknown");
  });

  it("requires consent again only for an explicit invalid grant", () => {
    expect(shouldRequireReauthorization(400, "invalid_grant")).toBe(true);
    expect(shouldRequireReauthorization(400, "invalid_client")).toBe(false);
    expect(shouldRequireReauthorization(408, "invalid_grant")).toBe(false);
    expect(shouldRequireReauthorization(429, "invalid_grant")).toBe(false);
    expect(shouldRequireReauthorization(503, "temporarily_unavailable")).toBe(false);
  });

  it("keeps response-body stream failures from changing HTTP classification", async () => {
    const response = {
      text: async () => { throw new Error("stream closed"); },
    } as Pick<Response, "text">;
    await expect(readResponseTextSafely(response)).resolves.toBe("");
    expect(classifyProviderHttpFailure(400)).toBe("failed");
  });
});

describe("campaign identity and reporting", () => {
  it("derives stable server campaign material from provider and reviewed content", () => {
    const first = providerCampaignMaterial("google_gmail", "Subject", "<p>Body</p>");
    const reopened = providerCampaignMaterial("google_gmail", "Subject", "<p>Body</p>");
    expect(providerCampaignMaterial("google_gmail", "  Subject  ", "<p>Body</p>")).not.toBe(first);
    expect(reopened).toBe(first);
    expect(providerCampaignMaterial("microsoft_graph", "Subject", "<p>Body</p>")).not.toBe(first);
    expect(providerCampaignMaterial("google_gmail", "Changed", "<p>Body</p>")).not.toBe(first);
  });

  it("distinguishes accepted, unknown, in-progress, and retryable failures", () => {
    const summary = summarizeProviderDelivery({
      accepted: 1,
      failed: 1,
      unknown: 1,
      inProgress: 1,
      alreadyAccepted: 1,
    }, "Google");
    expect(summary.message).toContain("1 accepted by Google");
    expect(summary.message).toContain("1 failed and may be retried");
    expect(summary.message).toContain("1 unknown");
    expect(summary.message).toContain("1 still in progress");
    expect(summary.message).toContain("1 already accepted");
    expect(summary.safeToClose).toBe(false);
  });

  it("preserves earlier chunk results when a later chunk throws", () => {
    const message = summarizeProviderDeliveryInterruption({
      accepted: 50,
      failed: 0,
      unknown: 0,
      inProgress: 0,
      alreadyAccepted: 0,
    }, "Google", "Google is temporarily unavailable.", 100);
    expect(message).toContain("50 accepted by Google");
    expect(message).toContain("50 remaining recipients were not reported");
    expect(message).toContain("Google is temporarily unavailable.");
  });

  it("offers retries only when there are retryable or unreported recipients", () => {
    expect(providerRetryAction({
      accepted: 0,
      failed: 0,
      unknown: 1,
      inProgress: 1,
      alreadyAccepted: 0,
    }, false)).toEqual({ label: "Await reconciliation", disabled: true });
    expect(providerRetryAction({
      accepted: 1,
      failed: 2,
      unknown: 1,
      inProgress: 0,
      alreadyAccepted: 0,
    }, false)).toEqual({ label: "Retry failed emails", disabled: false });
    expect(providerRetryAction({
      accepted: 50,
      failed: 0,
      unknown: 0,
      inProgress: 0,
      alreadyAccepted: 0,
    }, true)).toEqual({ label: "Retry remaining emails", disabled: false });
  });

  it("returns OAuth callbacks to Email Studio", () => {
    expect(providerConnectionRedirect("google", "connected")).toBe("/#/email?google=connected");
    expect(providerConnectionRedirect("microsoft", "error")).toBe("/#/email?graph=error");
  });
});
