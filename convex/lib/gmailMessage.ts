function cleanHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function requireEmail(value: string) {
  const email = cleanHeader(value).toLocaleLowerCase();
  const atom = "[A-Z0-9!#$%&'*+/=?^_`{|}~-]+";
  const localPart = `${atom}(?:\\.${atom})*`;
  const label = "[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?";
  const local = email.slice(0, email.indexOf("@"));
  if (
    !new RegExp(`^${localPart}@${label}(?:\\.${label})+$`, "i").test(email)
    || Buffer.byteLength(local, "utf8") > 64
    || Buffer.byteLength(email, "utf8") > 254
  ) {
    throw new Error("A valid email address is required.");
  }
  return email;
}

function encodeHeaderWords(value: string) {
  const chunks: string[] = [];
  let chunk = "";
  for (const character of value) {
    if (chunk && Buffer.byteLength(chunk + character, "utf8") > 45) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk += character;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks
    .map((part) => `=?UTF-8?B?${Buffer.from(part, "utf8").toString("base64")}?=`)
    .join("\r\n ");
}

function encodeDisplayName(value: string) {
  const name = cleanHeader(value);
  return name ? encodeHeaderWords(name) : "";
}

function encodeSubject(value: string) {
  const clean = cleanHeader(value);
  if (!clean) throw new Error("An email subject is required.");
  if (/^[\x20-\x7E]*$/.test(clean) && clean === value && Buffer.byteLength(clean, "utf8") <= 69) return clean;
  return encodeHeaderWords(clean);
}

function subjectHeader(subject: string) {
  return subject.startsWith("=?UTF-8?B?") ? `Subject:\r\n ${subject}` : `Subject: ${subject}`;
}

function recipientHeader(displayName: string, recipient: string) {
  if (!displayName) return `To: ${recipient}`;
  const header = `To: ${displayName}`;
  const mailbox = ` <${recipient}>`;
  return header.includes("\r\n") || Buffer.byteLength(header + mailbox, "utf8") > 78
    ? `${header}\r\n${mailbox}`
    : `${header}${mailbox}`;
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
  const recipientName = encodeDisplayName(input.recipientName);
  const subject = encodeSubject(input.subject);
  const boundary = `oakridge_${Buffer.from(`${recipient}:${subject}`, "utf8").toString("hex").slice(0, 32)}`;
  const message = [
    `From: Oakridge MUN <${sender}>`,
    recipientHeader(recipientName, recipient),
    subjectHeader(subject),
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
