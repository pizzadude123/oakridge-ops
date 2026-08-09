export type ProviderDeliveryStatus = "draft" | "opened_in_gmail" | "sending" | "accepted" | "failed" | "unknown" | "sent";
export type SendingProvider = "google_gmail" | "microsoft_graph";
export type MessageProvider = "gmail_compose" | SendingProvider | undefined;
export type ManualMessageStatus = "draft" | "opened_in_gmail" | "sent";
export type MicrosoftConnectionReturnTo = "email" | "inbox" | "excel";
export type ProviderResultCounts = {
  accepted: number;
  failed: number;
  unknown: number;
  inProgress: number;
  alreadyAccepted: number;
};

export class ProviderTokenError extends Error {
  constructor(
    readonly status: number,
    readonly providerError: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "ProviderTokenError";
  }
}

export function canClaimProviderDelivery(status?: ProviderDeliveryStatus) {
  return status === undefined || status === "failed";
}

export function canManuallyChangeStatus(provider: MessageProvider, status: ManualMessageStatus) {
  return provider === "gmail_compose" && (status === "draft" || status === "opened_in_gmail" || status === "sent");
}

export function classifyProviderHttpFailure(status: number): "failed" | "unknown" {
  return status === 408 || status >= 500 ? "unknown" : "failed";
}

export async function readResponseTextSafely(response: Pick<Response, "text">) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export function shouldRequireReauthorization(status: number, providerError?: string) {
  return status >= 400
    && status !== 429
    && classifyProviderHttpFailure(status) === "failed"
    && providerError === "invalid_grant";
}

export function providerCampaignMaterial(provider: SendingProvider, subject: string, bodyHtml: string) {
  return JSON.stringify(["oakridge-provider-campaign-v1", provider, subject, bodyHtml]);
}

export function summarizeProviderDelivery(counts: ProviderResultCounts, providerLabel: string) {
  const parts = [`${counts.accepted} accepted by ${providerLabel}`];
  if (counts.failed) parts.push(`${counts.failed} failed and may be retried`);
  if (counts.unknown) parts.push(`${counts.unknown} unknown—check Sent mail before any retry`);
  if (counts.inProgress) parts.push(`${counts.inProgress} still in progress`);
  if (counts.alreadyAccepted) parts.push(`${counts.alreadyAccepted} already accepted`);
  return {
    message: `${parts.join("; ")}.`,
    safeToClose: counts.failed === 0 && counts.unknown === 0 && counts.inProgress === 0,
  };
}

function reportedProviderDeliveryCount(counts: ProviderResultCounts) {
  return counts.accepted + counts.failed + counts.unknown + counts.inProgress + counts.alreadyAccepted;
}

export function summarizeProviderDeliveryInterruption(
  counts: ProviderResultCounts,
  providerLabel: string,
  errorMessage: string,
  totalRecipients: number,
) {
  const reported = reportedProviderDeliveryCount(counts);
  if (!reported) return `No delivery results were reported by ${providerLabel}. ${errorMessage}`;
  const remaining = Math.max(totalRecipients - reported, 0);
  return `${summarizeProviderDelivery(counts, providerLabel).message} ${remaining} remaining recipients were not reported. ${errorMessage}`;
}

export function providerRetryAction(counts: ProviderResultCounts, interrupted: boolean) {
  if (interrupted) {
    return reportedProviderDeliveryCount(counts)
      ? { label: "Retry remaining emails", disabled: false }
      : { label: "Retry send", disabled: false };
  }
  if (counts.failed) return { label: "Retry failed emails", disabled: false };
  if (counts.unknown || counts.inProgress) return { label: "Await reconciliation", disabled: true };
  return { label: "Send emails", disabled: false };
}

export function providerConnectionRedirect(
  provider: "google" | "microsoft",
  result: "connected" | "error",
  returnTo: MicrosoftConnectionReturnTo = "email",
) {
  const parameter = provider === "google" ? "google" : "graph";
  const destination = provider === "google" ? "email" : returnTo;
  return `/#/${destination}?${parameter}=${result}`;
}
