import { describe, expect, it } from "vitest";
import { sanitizeEditorHtml } from "./mailContent";

describe("sanitizeEditorHtml", () => {
  it("preserves professional formatting and removes executable content", () => {
    const html = sanitizeEditorHtml('<p>Hello <strong>delegate</strong>.</p><script>alert(1)</script><a href="javascript:alert(2)">Bad</a><a href="https://oakridge.in">Good</a>');
    expect(html).toContain("<p>Hello <strong>delegate</strong>.</p>");
    expect(html).toContain('href="https://oakridge.in"');
    expect(html).not.toContain("script");
    expect(html).not.toContain("javascript:");
  });
});
