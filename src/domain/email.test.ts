import { describe, expect, it } from "vitest";
import {
  buildGraphSendMailPayload,
  buildGmailComposeUrl,
  buildOakridgeEmailHtml,
  matchRoutingRule,
  personalizeTemplate,
  unresolvedFieldsForRecipients,
  type RoutingRule,
} from "./email";

describe("buildOakridgeEmailHtml", () => {
  it("wraps editor content in a responsive branded email document", () => {
    const html = buildOakridgeEmailHtml({
      bodyHtml: "<p>Hello Pranay,</p><p>Your committee update is ready.</p>",
      preheader: "Your Oakridge MUN update",
    });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("@media only screen and (max-width: 620px)");
    expect(html).toContain("https://pizzadude123.github.io/oakridge-ops/oakridge-logo.png");
    expect(html).toContain("Oakridge MUN");
    expect(html).toContain("Your committee update is ready.");
    expect(html).toContain("#003057");
  });
});

describe("buildGraphSendMailPayload", () => {
  it("targets one recipient with a branded HTML body", () => {
    const payload = buildGraphSendMailPayload({
      recipientEmail: "aarav@example.com",
      recipientName: "Aarav Rao",
      subject: "Your DISEC allocation",
      html: "<html><body>Oakridge</body></html>",
    });

    expect(payload.message.subject).toBe("Your DISEC allocation");
    expect(payload.message.body).toEqual({ contentType: "HTML", content: "<html><body>Oakridge</body></html>" });
    expect(payload.message.toRecipients).toEqual([{ emailAddress: { address: "aarav@example.com", name: "Aarav Rao" } }]);
    expect(payload.saveToSentItems).toBe(true);
  });
});

describe("personalizeTemplate", () => {
  it("replaces known merge fields and reports missing ones", () => {
    const result = personalizeTemplate(
      "Hello {{firstName}}, your {{allocation}} allocation is ready for {{school}}.",
      { firstName: "Pranay", allocation: "France" },
    );

    expect(result.output).toBe(
      "Hello Pranay, your France allocation is ready for {{school}}.",
    );
    expect(result.unresolved).toEqual(["school"]);
  });

  it("escapes contact values before inserting them into HTML", () => {
    const result = personalizeTemplate("<p>Hello {{firstName}}</p>", {
      firstName: "<script>alert(1)</script>",
    }, "html");

    expect(result.output).toContain("&lt;script&gt;");
    expect(result.output).not.toContain("<script>");
  });

  it("checks merge fields for every selected recipient, not only the preview", () => {
    const unresolved = unresolvedFieldsForRecipients(
      "Hello {{firstName}} — {{allocation}}",
      "<p>{{school}}</p>",
      [
        { firstName: "Aarav", allocation: "France", school: "Oakridge" },
        { firstName: "Maya", allocation: "", school: "Oakridge" },
      ],
    );

    expect(unresolved).toEqual([{ recipientIndex: 1, fields: ["allocation"] }]);
  });
});

describe("matchRoutingRule", () => {
  const rules: RoutingRule[] = [
    {
      id: "policy",
      name: "Policy allocations",
      department: "Policy",
      keywords: ["allocation", "committee"],
      recipients: ["nagapranayimmadi@gmail.com"],
      enabled: true,
      priority: 20,
    },
    {
      id: "finance",
      name: "Finance payments",
      department: "Finance",
      keywords: ["payment", "receipt"],
      recipients: ["cattartzz@gmail.com"],
      enabled: true,
      priority: 10,
    },
  ];

  it("matches whole subject text case-insensitively and honors priority", () => {
    expect(matchRoutingRule("ALLOCATION receipt attached", rules)?.id).toBe("policy");
  });

  it("ignores disabled rules and returns null when nothing matches", () => {
    expect(matchRoutingRule("Travel plans", rules)).toBeNull();
    expect(matchRoutingRule("Payment status", rules.map((r) => ({ ...r, enabled: false })))).toBeNull();
  });
});

describe("buildGmailComposeUrl", () => {
  it("creates an encoded Gmail compose link using the required sender account", () => {
    const url = new URL(buildGmailComposeUrl({
      sender: "nagapranayimmadi@gmail.com",
      to: ["nagapranayimmadi@gmail.com"],
      cc: ["cattartzz@gmail.com"],
      subject: "Allocation & next steps",
      body: `Hello Pranay,
Your allocation is ready.`,
    }));

    expect(url.origin).toBe("https://mail.google.com");
    expect(url.pathname).toBe("/mail/");
    expect(url.searchParams.get("authuser")).toBe("nagapranayimmadi@gmail.com");
    expect(url.searchParams.get("to")).toBe("nagapranayimmadi@gmail.com");
    expect(url.searchParams.get("subject")).toBe("Allocation & next steps");
  });
});
