export function htmlToPlainText(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  return document.body.textContent?.replace(/\u00a0/g, " ").trim() ?? "";
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join("") || "?";
}
