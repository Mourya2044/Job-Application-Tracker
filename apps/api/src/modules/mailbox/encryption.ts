import crypto from "crypto";
import { config } from "../../config";

// Derive a 32-byte key for AES-256-GCM from config secret
function getEncryptionKey(): Buffer {
  const secret = config.security.encryptionKey || config.auth.jwtSecret || "default-secret-key-track-app-32b";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts sensitive OAuth credentials using AES-256-GCM.
 * Output format: enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
 */
export function encryptToken(plainText?: string | null): string | null {
  if (!plainText) return null;
  if (plainText.startsWith("enc:v1:")) return plainText;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for AES-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `enc:v1:${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM encrypted tokens. Returns null if invalid or tampered.
 */
export function decryptToken(encryptedToken?: string | null): string | null {
  if (!encryptedToken) return null;
  if (!encryptedToken.startsWith("enc:v1:")) {
    // Return unencrypted token as fallback for backwards compatibility
    return encryptedToken;
  }

  const parts = encryptedToken.slice(7).split(":");
  if (parts.length !== 3) {
    return null;
  }

  const [ivHex, tagHex, cipherHex] = parts;

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(tagHex, "hex");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    return null;
  }
}

