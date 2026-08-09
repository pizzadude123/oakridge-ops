function cleanHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function cleanDisplayName(value: string) {
  return cleanHeader(value).replace(/[<>"]/g, "").trim();
}

function requireEmail(value: string) {
  const email = cleanHeader(value).toLocaleLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Error("A valid email address is required.");
  return email;
}

function encodeSubject(value: string) {
  const subject = cleanHeader(value);
  if (!subject) throw new Error("An email subject is required.");
  return /^[\x20-\x7E]+$/.test(subject)
    ? subject
    : `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function mimeBase64(value: string) {
  return Buffer.from(value, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

export type GmailRawMessageInput = {
  senderEmail: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  text: string;
  html: string;
};

export function buildGmailRawMessage(input: GmailRawMessageInput) {
  const sender = requireEmail(input.senderEmail);
  const recipient = requireEmail(input.recipientEmail);
  const recipientName = cleanDisplayName(input.recipientName) || recipient;
  const subject = encodeSubject(input.subject);
  const boundary = `oakridge_${Buffer.from(`${recipient}:${subject}`, "utf8").toString("hex").slice(0, 32)}`;
  const message = [
    `From: Oakridge MUN <${sender}>`,
    `To: ${recipientName} <${recipient}>`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    mimeBase64(input.text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    mimeBase64(input.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return base64Url(message);
}
