const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeBase64(bytes: Uint8Array) {
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const value = (first << 16) | (second << 8) | third;
    result += BASE64_ALPHABET[(value >>> 18) & 63];
    result += BASE64_ALPHABET[(value >>> 12) & 63];
    result += index + 1 < bytes.length ? BASE64_ALPHABET[(value >>> 6) & 63] : "=";
    result += index + 2 < bytes.length ? BASE64_ALPHABET[value & 63] : "=";
  }
  return result;
}

function decodeBase64(value: string) {
  const clean = value.replace(/\s/g, "");
  if (clean.length % 4 !== 0) throw new Error("Invalid base64 secret.");
  const output: number[] = [];
  for (let index = 0; index < clean.length; index += 4) {
    const chars = clean.slice(index, index + 4);
    const values = [...chars].map((char) => char === "=" ? 0 : BASE64_ALPHABET.indexOf(char));
    if (values.some((part, partIndex) => part < 0 && chars[partIndex] !== "=")) throw new Error("Invalid base64 secret.");
    const packed = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];
    output.push((packed >>> 16) & 255);
    if (chars[2] !== "=") output.push((packed >>> 8) & 255);
    if (chars[3] !== "=") output.push(packed & 255);
  }
  return new Uint8Array(output);
}

function base64Url(bytes: Uint8Array) {
  return encodeBase64(bytes).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function encryptionKey() {
  const encoded = process.env.GRAPH_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("Microsoft Graph token encryption is not configured.");
  const raw = decodeBase64(encoded);
  if (raw.byteLength !== 32) throw new Error("Microsoft Graph encryption key must contain 32 bytes.");
  return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export function randomBase64Url(byteLength = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

export async function encryptGraphSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  return { ciphertext: encodeBase64(new Uint8Array(encrypted)), iv: encodeBase64(iv) };
}

export async function decryptGraphSecret(ciphertext: string, iv: string) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(iv) },
    await encryptionKey(),
    decodeBase64(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}
