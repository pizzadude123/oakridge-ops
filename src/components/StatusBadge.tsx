import clsx from "clsx";

const labels: Record<string, string> = {
  reported_paid: "Paid — unverified",
  unpaid: "Not paid",
  pending: "Payment pending",
  needs_review: "Needs review",
  awaiting_reply: "Awaiting reply",
  replied: "Replied",
  not_contacted: "Not contacted",
  draft: "Draft",
  opened_in_gmail: "Opened in Gmail",
  sent: "Sent via Outlook",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={clsx("status-badge", `status-badge--${status}`)}>{labels[status] ?? status}</span>;
}
