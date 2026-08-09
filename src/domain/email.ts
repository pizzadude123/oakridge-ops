export type MergeFields = Record<string, string | number | null | undefined>;

export type PersonalizationResult = {
  output: string;
  unresolved: string[];
};

export type RoutingRule = {
  id: string;
  name: string;
  department: string;
  keywords: string[];
  recipients: string[];
  enabled: boolean;
  priority: number;
};

export type GmailComposeInput = {
  sender: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
};

export type GraphSendMailInput = {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  html: string;
};

const MERGE_FIELD_PATTERN = /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildOakridgeEmailHtml({ bodyHtml, preheader }: { bodyHtml: string; preheader: string }) {
  const safePreheader = escapeHtml(preheader);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Oakridge MUN</title>
  <style>
    @media only screen and (max-width: 620px) {
      .email-shell { width: 100% !important; }
      .email-pad { padding-left: 24px !important; padding-right: 24px !important; }
      .email-title { font-size: 28px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#eef4f7;color:#10233f;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safePreheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef4f7;">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" class="email-shell" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 16px 50px rgba(0,48,87,.12);">
        <tr><td style="height:8px;background:#30CDD7;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td class="email-pad" style="padding:30px 42px 24px;background:#003057;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
            <td width="74" valign="middle"><img src="https://pizzadude123.github.io/oakridge-ops/oakridge-logo.png" width="62" height="62" alt="Oakridge MUN" style="display:block;width:62px;height:62px;border:0;border-radius:14px;background:#ffffff;object-fit:contain;"></td>
            <td valign="middle" style="padding-left:16px;color:#FAF5ED;"><strong class="email-title" style="display:block;font-size:30px;line-height:1.05;letter-spacing:-.5px;">Oakridge MUN</strong><span style="display:block;margin-top:6px;color:#B4EBF5;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Delegate communications</span></td>
          </tr></table>
        </td></tr>
        <tr><td class="email-pad" style="padding:38px 42px 40px;background:#ffffff;color:#203653;font-size:16px;line-height:1.7;">${bodyHtml}</td></tr>
        <tr><td class="email-pad" style="padding:24px 42px;background:#FAF5ED;border-top:1px solid #dce7eb;color:#4e647d;font-size:12px;line-height:1.55;">
          <strong style="display:block;color:#003057;font-size:14px;">Oakridge Model United Nations</strong>
          <span style="display:block;margin-top:4px;">Clear communication. Thoughtful diplomacy. One community.</span>
          <span style="display:block;margin-top:14px;color:#A93B76;font-weight:700;">Oakridge International School · MUN Operations</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildGraphSendMailPayload(input: GraphSendMailInput) {
  return {
    message: {
      subject: input.subject,
      body: { contentType: "HTML" as const, content: input.html },
      toRecipients: [{ emailAddress: { address: input.recipientEmail, name: input.recipientName } }],
    },
    saveToSentItems: true,
  };
}

export function personalizeTemplate(
  template: string,
  fields: MergeFields,
  mode: "text" | "html" = "text",
): PersonalizationResult {
  const unresolved = new Set<string>();
  const output = template.replace(MERGE_FIELD_PATTERN, (token, field: string) => {
    const value = fields[field];
    if (value === undefined || value === null || value === "") {
      unresolved.add(field);
      return token;
    }
    const rendered = String(value);
    return mode === "html" ? escapeHtml(rendered) : rendered;
  });

  return { output, unresolved: [...unresolved] };
}

export function matchRoutingRule(
  subject: string,
  rules: RoutingRule[],
): RoutingRule | null {
  const normalizedSubject = subject.trim().toLocaleLowerCase();
  if (!normalizedSubject) return null;

  return (
    rules
      .filter(
        (rule) =>
          rule.enabled &&
          rule.recipients.length > 0 &&
          rule.keywords.some((keyword) =>
            normalizedSubject.includes(keyword.trim().toLocaleLowerCase()),
          ),
      )
      .sort((left, right) => right.priority - left.priority)[0] ?? null
  );
}

export function buildGmailComposeUrl(input: GmailComposeInput): string {
  const url = new URL("https://mail.google.com/mail/");
  url.searchParams.set("authuser", input.sender);
  url.searchParams.set("view", "cm");
  url.searchParams.set("fs", "1");
  url.searchParams.set("tf", "1");
  url.searchParams.set("to", input.to.join(","));
  if (input.cc?.length) url.searchParams.set("cc", input.cc.join(","));
  if (input.bcc?.length) url.searchParams.set("bcc", input.bcc.join(","));
  url.searchParams.set("subject", input.subject);
  url.searchParams.set("body", input.body);
  return url.toString();
}
