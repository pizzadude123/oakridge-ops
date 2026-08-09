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
    expect(message).toContain(`To: =?UTF-8?B?${Buffer.from("Aarav Rao").toString("base64")}?= <delegate@example.com>`);
    expect(message).toContain("Subject: Oakridge allocation update");
    expect(message).toContain("Content-Type: multipart/alternative;");
    expect(message).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(message).toContain("Content-Type: text/html; charset=UTF-8");
    expect(message).not.toContain("bcc:");
    expect(message).not.toContain("cc:");
    expect(message).toContain(Buffer.from("Hello Aarav. Your allocation is ready.").toString("base64"));
    expect(message.replaceAll("\r\n", "")).toContain(Buffer.from("<h1>Hello Aarav</h1><p>Your allocation is <strong>ready</strong>.</p>").toString("base64"));
  });

  it("encodes subjects and display names so imported names cannot add recipients", () => {
    const message = decodeRaw(buildGmailRawMessage({
      senderEmail: "nagapranayimmadi@gmail.com",
      recipientEmail: "delegate@example.com",
      recipientName: "attacker@example.com, Victim\r\nBcc: hidden@example.com",
      subject: "Oakridge – comité update\r\nBcc: attacker@example.com",
      text: "Safe text",
      html: "<p>Safe HTML</p>",
    }));

    const subjectHeader = message.slice(message.indexOf("Subject:"), message.indexOf("\r\nMIME-Version: "));
    const subjectWords = subjectHeader.match(/=\?UTF-8\?B\?[^?]+\?=/g) ?? [];
    expect(subjectWords.length).toBeGreaterThan(1);
    expect(subjectWords.every((word) => word.length <= 75)).toBe(true);
    expect(subjectHeader.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 78)).toBe(true);
    expect(message).toContain("<delegate@example.com>");
    expect(message).not.toMatch(/\r?\nTo: attacker@example\.com,/i);
    expect(message).not.toMatch(/\r?\nBcc:/i);
  });

  it("rejects mailbox strings containing extra address syntax", () => {
    expect(() => buildGmailRawMessage({
      senderEmail: "cattartzz@gmail.com",
      recipientEmail: "delegate@example.com,other",
      recipientName: "Delegate",
      subject: "Safe subject",
      text: "Safe text",
      html: "<p>Safe HTML</p>",
    })).toThrow("A valid email address is required.");
    expect(() => buildGmailRawMessage({
      senderEmail: "cattartzz@gmail.com",
      recipientEmail: "delegate..name@example.com",
      recipientName: "Delegate",
      subject: "Safe subject",
      text: "Safe text",
      html: "<p>Safe HTML</p>",
    })).toThrow("A valid email address is required.");
  });

  it("rejects mailboxes beyond SMTP octet limits", () => {
    const base = {
      senderEmail: "cattartzz@gmail.com",
      recipientName: "Delegate",
      subject: "Safe subject",
      text: "Safe text",
      html: "<p>Safe HTML</p>",
    };
    expect(() => buildGmailRawMessage({
      ...base,
      recipientEmail: `${"a".repeat(65)}@example.com`,
    })).toThrow("A valid email address is required.");
    expect(() => buildGmailRawMessage({
      ...base,
      recipientEmail: `a@${[63, 63, 63, 63, 60].map((length) => "a".repeat(length)).join(".")}`,
    })).toThrow("A valid email address is required.");
  });

  it("splits and folds long RFC 2047 display names", () => {
    const message = decodeRaw(buildGmailRawMessage({
      senderEmail: "cattartzz@gmail.com",
      recipientEmail: "delegate@example.com",
      recipientName: "Å".repeat(100),
      subject: "Safe subject",
      text: "Safe text",
      html: "<p>Safe HTML</p>",
    }));
    const toHeader = message.slice(message.indexOf("To: "), message.indexOf("\r\nSubject: "));
    const encodedWords = toHeader.match(/=\?UTF-8\?B\?[^?]+\?=/g) ?? [];
    expect(encodedWords.length).toBeGreaterThan(1);
    expect(encodedWords.every((word) => word.length <= 75)).toBe(true);
    expect(toHeader).toContain("\r\n ");
  });
});
