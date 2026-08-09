import { describe, expect, it } from "vitest";
import { buildGmailRawMessage } from "./gmailMessage";

function decodeRaw(raw: string) {
  return Buffer.from(raw.replaceAll("-", "+").replaceAll("_", "/"), "base64").toString("utf8");
}

describe("buildGmailRawMessage", () => {
  it("builds an isolated multipart HTML message for one recipient", () => {
    const raw = buildGmailRawMessage({
      senderEmail: "nagapranayimmadi@gmail.com",
      recipientEmail: "delegate@example.com",
      recipientName: "Aarav Rao",
      subject: "Oakridge allocation update",
      text: "Hello Aarav. Your allocation is ready.",
      html: "<h1>Hello Aarav</h1><p>Your allocation is <strong>ready</strong>.</p>",
    });
    const message = decodeRaw(raw);

    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(message).toContain("From: Oakridge MUN <nagapranayimmadi@gmail.com>");
    expect(message).toContain("To: Aarav Rao <delegate@example.com>");
    expect(message).toContain("Subject: Oakridge allocation update");
    expect(message).toContain("Content-Type: multipart/alternative;");
    expect(message).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(message).toContain("Content-Type: text/html; charset=UTF-8");
    expect(message).not.toContain("bcc:");
    expect(message).not.toContain("cc:");
    expect(message).toContain(Buffer.from("Hello Aarav. Your allocation is ready.").toString("base64"));
    expect(message.replaceAll("\r\n", "")).toContain(Buffer.from("<h1>Hello Aarav</h1><p>Your allocation is <strong>ready</strong>.</p>").toString("base64"));
  });

  it("encodes Unicode subjects and strips injected header lines", () => {
    const message = decodeRaw(buildGmailRawMessage({
      senderEmail: "nagapranayimmadi@gmail.com",
      recipientEmail: "delegate@example.com",
      recipientName: "Delegate\r\nBcc: attacker@example.com",
      subject: "Oakridge – comité update\r\nBcc: attacker@example.com",
      text: "Safe text",
      html: "<p>Safe HTML</p>",
    }));

    expect(message).toContain(`Subject: =?UTF-8?B?${Buffer.from("Oakridge – comité update Bcc: attacker@example.com").toString("base64")}?=`);
    expect(message).toContain("To: Delegate Bcc: attacker@example.com <delegate@example.com>");
    expect(message).not.toMatch(/\r?\nBcc:/i);
  });
});
