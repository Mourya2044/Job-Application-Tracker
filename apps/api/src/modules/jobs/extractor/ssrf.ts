import dns from "dns/promises";
import net from "net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "metadata.google.internal",
  "169.254.169.254",
  "instance-data",
]);

/**
 * Checks if an IP address belongs to private, loopback, link-local, multicast, or reserved ranges.
 */
export function isRestrictedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }
    const [b0, b1] = parts;

    // 0.0.0.0/8 (Current network)
    if (b0 === 0) return true;
    // 10.0.0.0/8 (Private)
    if (b0 === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (b0 === 127) return true;
    // 169.254.0.0/16 (Link-local / Cloud metadata)
    if (b0 === 169 && b1 === 254) return true;
    // 172.16.0.0/12 (Private)
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (b0 === 192 && b1 === 168) return true;
    // 224.0.0.0/4 (Multicast)
    if (b0 >= 224 && b0 <= 239) return true;
    // 240.0.0.0/4 (Reserved) & 255.255.255.255 (Broadcast)
    if (b0 >= 240) return true;

    return false;
  }

  if (net.isIPv6(ip)) {
    const norm = ip.toLowerCase();
    // Loopback ::1
    if (norm === "::1" || norm === "0:0:0:0:0:0:0:1") return true;
    // Unspecified ::
    if (norm === "::" || norm === "0:0:0:0:0:0:0:0") return true;
    // Link-local fe80::/10
    if (norm.startsWith("fe8") || norm.startsWith("fe9") || norm.startsWith("fea") || norm.startsWith("feb")) return true;
    // Unique local fc00::/7 (fc00:: - fdff::)
    if (norm.startsWith("fc") || norm.startsWith("fd")) return true;
    // IPv4-mapped IPv6 ::ffff:a.b.c.d
    if (norm.startsWith("::ffff:")) {
      const ipv4Part = norm.slice(7);
      return isRestrictedIp(ipv4Part);
    }
    // Multicast ff00::/8
    if (norm.startsWith("ff")) return true;

    return false;
  }

  return true;
}

/**
 * Validates a target URL against SSRF vulnerabilities:
 * - Scheme must be http or https
 * - Hostname cannot be blocked metadata/internal names
 * - Resolves DNS and blocks internal/private/loopback/link-local IP addresses
 */
export async function validateSafeUrl(rawUrl: string): Promise<URL> {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new Error("Target URL must be a non-empty string.");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error(`Invalid URL format: '${rawUrl}'`);
  }

  const scheme = parsed.protocol.toLowerCase();
  if (scheme !== "http:" && scheme !== "https:") {
    throw new Error(`Unsupported URL scheme: '${scheme}'. Only http: and https: are allowed.`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    throw new Error("Target URL is missing a valid hostname.");
  }

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".internal") || hostname.endsWith(".local")) {
    throw new Error(`Restricted hostname '${hostname}'. Access blocked by SSRF defense.`);
  }

  // If hostname is directly an IP literal
  if (net.isIP(hostname)) {
    if (isRestrictedIp(hostname)) {
      throw new Error(`Target IP '${hostname}' is a restricted private or loopback address.`);
    }
    return parsed;
  }

  // Resolve DNS to verify IP addresses
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new Error(`Could not resolve hostname '${hostname}'.`);
    }

    for (const record of addresses) {
      if (isRestrictedIp(record.address)) {
        throw new Error(
          `Security Exception: Hostname '${hostname}' resolves to restricted internal IP ${record.address}. Access blocked.`
        );
      }
    }
  } catch (err: any) {
    if (err.message?.includes("Security Exception") || err.message?.includes("restricted")) {
      throw err;
    }
    throw new Error(`DNS resolution check failed for '${hostname}': ${err.message}`);
  }

  return parsed;
}
