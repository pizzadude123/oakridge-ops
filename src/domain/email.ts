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

const MERGE_FIELD_PATTERN = /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
