export type InboxRoutingRule = {
  name: string;
  department: string;
  keywords: string[];
  recipients: string[];
  enabled: boolean;
  priority: number;
};

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

export function routeInboxSubject(subject: string, rules: InboxRoutingRule[]) {
  const normalizedSubject = normalize(subject);
  return [...rules]
    .filter((rule) => rule.enabled)
    .sort((left, right) => right.priority - left.priority || left.name.localeCompare(right.name))
    .find((rule) => rule.keywords.some((keyword) => normalizedSubject.includes(normalize(keyword)))) ?? null;
}
