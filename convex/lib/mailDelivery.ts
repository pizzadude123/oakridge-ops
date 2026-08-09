export type ProviderDeliveryStatus = "draft" | "opened_in_gmail" | "sending" | "accepted" | "failed" | "unknown" | "sent";
export type SendingProvider = "google_gmail" | "microsoft_graph";
export type MessageProvider = "gmail_compose" | SendingProvider | undefined;
export type ManualMessageStatus = "draft" | "opened_in_gmail" | "sent";

export function canClaimProviderDelivery(status?: ProviderDeliveryStatus) {
  return status === undefined || status === "failed";
}

export function canManuallyChangeStatus(provider: MessageProvider, status: ManualMessageStatus) {
  return provider === "gmail_compose" && (status === "draft" || status === "opened_in_gmail" || status === "sent");
}
