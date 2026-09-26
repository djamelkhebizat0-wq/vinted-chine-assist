import crypto from "node:crypto";

function keyBuf() {
  const secret = process.env.ENCRYPTION_KEY || "";
  if (!secret || secret.length < 8) {
    throw new Error("ENCRYPTION_KEY manquante ou trop courte (≥ 8 caractères)");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptJson(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuf(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: enc.toString("base64")
  };
}

export function decryptJson(blob) {
  if (!blob || !blob.data) return null;
  const iv = Buffer.from(blob.iv, "base64");
  const tag = Buffer.from(blob.tag, "base64");
  const data = Buffer.from(blob.data, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuf(), iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(out.toString("utf8"));
}
