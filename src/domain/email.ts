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
  inlineImages?: InlineEmailImage[];
};

export type EmailLayoutImage = {
  src: string;
  alt: string;
};

export type InlineEmailImage = {
  contentId: string;
  contentType: "image/png" | "image/jpeg" | "image/gif";
  fileName: string;
  contentBase64: string;
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

export function buildOakridgeEmailHtml({
  bodyHtml,
  preheader,
  images = [],
}: {
  bodyHtml: string;
  preheader: string;
  images?: EmailLayoutImage[];
}) {
  const safePreheader = escapeHtml(preheader);
  const imageRows = images.map((image) => `
        <tr><td class="email-image-pad" style="padding:0 42px 18px;background:#FAF5ED;">
          <img src="${escapeHtml(image.src)}" width="556" alt="${escapeHtml(image.alt)}" style="display:block;width:100%;max-width:556px;height:auto;border:0;border-radius:14px;background:#DCEEF0;">
        </td></tr>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Oakridge MUN</title>
  <style>
    body, table, td { margin:0;padding:0;border-collapse:collapse;border-spacing:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%; }
    img { -ms-interpolation-mode:bicubic; }
    @media only screen and (max-width: 620px) {
      .email-shell { width: 100% !important; }
      .email-pad { padding-left: 24px !important; padding-right: 24px !important; }
      .email-image-pad { padding-left: 18px !important; padding-right: 18px !important; }
      .email-title { font-size: 25px !important; }
    }
    .email-copy h1, .email-copy h2, .email-copy h3 { margin:0 0 18px;color:#003057;line-height:1.15;letter-spacing:-.02em; }
    .email-copy h1 { font-size:30px; } .email-copy h2 { font-size:25px; } .email-copy h3 { font-size:20px; }
    .email-copy p { margin:0 0 18px; } .email-copy ul, .email-copy ol { margin:0 0 20px;padding-left:24px; }
    .email-copy a { color:#096F7A;font-weight:700; } .email-copy blockquote { margin:22px 0;padding:16px 18px;border-left:4px solid #30CDD7;background:#E5F5F6; }
  </style>
</head>
<body bgcolor="#DCEEF0" style="margin:0;padding:0;background:#DCEEF0;color:#16324F;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safePreheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#DCEEF0" style="background:#DCEEF0;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" class="email-shell" width="640" cellspacing="0" cellpadding="0" border="0" bgcolor="#FAF5ED" style="width:640px;max-width:640px;background:#FAF5ED;border-radius:18px;overflow:hidden;box-shadow:0 16px 50px rgba(0,48,87,.14);">
        <tr><td style="height:6px;background:#30CDD7;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td class="email-pad" style="padding:25px 42px 23px;background:#003057;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
            <td width="62" valign="middle"><img src="https://pizzadude123.github.io/oakridge-ops/oakridge-logo-white.png" width="52" height="52" alt="" style="display:block;width:52px;height:52px;border:0;object-fit:contain;"></td>
            <td valign="middle" style="padding-left:14px;color:#FAF5ED;"><span style="display:block;margin-bottom:5px;color:#30CDD7;font-size:10px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;">Official delegate communication</span><strong class="email-title" style="display:block;font-size:27px;line-height:1.05;letter-spacing:-.5px;">Oakridge MUN</strong></td>
          </tr></table>
        </td></tr>
        <tr><td class="email-pad" style="padding:15px 42px;background:#B4EBF5;color:#003057;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Delegate communications&nbsp;&nbsp;·&nbsp;&nbsp;Oakridge Model United Nations</td></tr>${imageRows}
        <tr><td class="email-pad email-copy" style="padding:34px 42px 38px;background:#FAF5ED;color:#203653;font-size:16px;line-height:1.7;">${bodyHtml}</td></tr>
        <tr><td class="email-pad" style="padding:24px 42px;background:#003057;border-top:4px solid #30CDD7;color:#B4EBF5;font-size:12px;line-height:1.6;">
          <strong style="display:block;color:#FAF5ED;font-size:14px;">Oakridge Model United Nations</strong>
          <span style="display:block;margin-top:4px;">Reply to this email if you need clarification or support.</span>
          <span style="display:block;margin-top:12px;color:#30CDD7;font-weight:700;">Oakridge International School · MUN Operations</span>
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
      attachments: input.inlineImages?.map((image) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: image.fileName,
        contentType: image.contentType,
        contentBytes: image.contentBase64,
        contentId: image.contentId,
        isInline: true,
      })),
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

export function unresolvedFieldsForRecipients(
  subjectTemplate: string,
  bodyHtmlTemplate: string,
  recipients: MergeFields[],
) {
  return recipients.flatMap((fields, recipientIndex) => {
    const unresolved = [...new Set([
      ...personalizeTemplate(subjectTemplate, fields).unresolved,
      ...personalizeTemplate(bodyHtmlTemplate, fields, "html").unresolved,
    ])];
    return unresolved.length ? [{ recipientIndex, fields: unresolved }] : [];
  });
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
