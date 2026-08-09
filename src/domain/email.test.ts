import { describe, expect, it } from "vitest";
import {
  buildGmailComposeUrl,
  matchRoutingRule,
  personalizeTemplate,
  type RoutingRule,
} from "./email";

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
