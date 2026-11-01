import crypto from "crypto";
import { config } from "../../config";
import { encryptToken, decryptToken } from "./encryption";
import { db } from "../../db";
import { userMailboxAccounts, UserMailboxAccount } from "../../db/schema/mailbox";
import { and, eq } from "drizzle-orm";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export class GoogleOAuthService {
  /**
   * Generates a signed, tamper-resistant CSRF state token bound to the userId.
   */
  static generateStateToken(userId: string): string {
    const timestamp = Date.now();
    const payload = `${userId}:${timestamp}`;
    const hmac = crypto.createHmac("sha256", config.auth.jwtSecret).update(payload).digest("hex");
    return Buffer.from(`${payload}:${hmac}`).toString("base64url");
  }

  /**
   * Validates the CSRF state token and extracts the authenticated userId.
   */
  static validateStateToken(state: string, maxAgeMs = 15 * 60 * 1000): string {
    try {
      const decoded = Buffer.from(state, "base64url").toString("utf-8");
      const parts = decoded.split(":");
      if (parts.length !== 3) {
        throw new Error("Malformed OAuth state token");
      }

      const [userId, timestampStr, signature] = parts;
      const timestamp = Number(timestampStr);

      if (isNaN(timestamp) || Date.now() - timestamp > maxAgeMs) {
        throw new Error("OAuth state token has expired");
      }

      const expectedHmac = crypto
        .createHmac("sha256", config.auth.jwtSecret)
        .update(`${userId}:${timestamp}`)
        .digest("hex");

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedHmac))) {
        throw new Error("Invalid OAuth state signature");
      }

      return userId;
    } catch (err: any) {
      throw new Error(`State verification failed: ${err.message}`);
    }
  }

  /**
   * Constructs the Google OAuth2 consent URL with least-privilege readonly scopes.
   */
  static getAuthorizationUrl(userId: string): string {
    const state = this.generateStateToken(userId);
    const params = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: config.google.redirectUri,
      response_type: "code",
      scope: GMAIL_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchanges authorization code for tokens, extracts user email, and saves encrypted connection.
   */
  static async handleCallback(code: string, state: string): Promise<UserMailboxAccount> {
    const userId = this.validateStateToken(state);

    // 1. Exchange code for access & refresh tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: config.google.redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      throw new Error(`Failed to exchange authorization code: ${errText}`);
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      id_token?: string;
    };

    // 2. Fetch user profile to identify mailbox email
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoResponse.ok) {
      throw new Error("Failed to retrieve Google user profile");
    }

    const profile = (await userInfoResponse.json()) as { email: string };
    const emailAddress = profile.email.toLowerCase();

    // 3. Encrypt sensitive tokens at rest
    const encryptedAccessToken = encryptToken(tokenData.access_token);
    const encryptedRefreshToken = encryptToken(tokenData.refresh_token);
    const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    // 4. Upsert mailbox account
    const existing = await db.query.userMailboxAccounts.findFirst({
      where: and(
        eq(userMailboxAccounts.userId, userId),
        eq(userMailboxAccounts.emailAddress, emailAddress)
      ),
    });

    if (existing) {
      const [updated] = await db
        .update(userMailboxAccounts)
        .set({
          accessTokenEncrypted: encryptedAccessToken,
          refreshTokenEncrypted: encryptedRefreshToken || existing.refreshTokenEncrypted,
          tokenExpiresAt,
          isSyncEnabled: true,
          pubsubTopic: config.google.pubsubTopic,
          updatedAt: new Date(),
        })
        .where(eq(userMailboxAccounts.id, existing.id))
        .returning();

      return updated;
    } else {
      const [created] = await db
        .insert(userMailboxAccounts)
        .values({
          userId,
          provider: "google",
          emailAddress,
          accessTokenEncrypted: encryptedAccessToken,
          refreshTokenEncrypted: encryptedRefreshToken,
          tokenExpiresAt,
          isSyncEnabled: true,
          pubsubTopic: config.google.pubsubTopic,
        })
        .returning();

      return created;
    }
  }

  /**
   * Refreshes access token if expired or about to expire within 5 minutes.
   */
  static async getValidAccessToken(mailbox: UserMailboxAccount): Promise<string> {
    const now = new Date();
    const expiryBufferMs = 5 * 60 * 1000;

    const currentAccess = decryptToken(mailbox.accessTokenEncrypted);
    if (mailbox.tokenExpiresAt && mailbox.tokenExpiresAt.getTime() - now.getTime() > expiryBufferMs && currentAccess) {
      return currentAccess;
    }

    const refreshToken = decryptToken(mailbox.refreshTokenEncrypted);
    if (!refreshToken) {
      throw new Error("Mailbox has no refresh token. Re-authorization required.");
    }

    const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });

    if (!refreshResponse.ok) {
      const errText = await refreshResponse.text();
      throw new Error(`Google token refresh failed: ${errText}`);
    }

    const data = (await refreshResponse.json()) as { access_token: string; expires_in: number };
    const newExpiresAt = new Date(Date.now() + data.expires_in * 1000);
    const newEncryptedAccess = encryptToken(data.access_token);

    await db
      .update(userMailboxAccounts)
      .set({
        accessTokenEncrypted: newEncryptedAccess,
        tokenExpiresAt: newExpiresAt,
        updatedAt: now,
      })
      .where(eq(userMailboxAccounts.id, mailbox.id));

    return data.access_token;
  }

  /**
   * Revokes Google OAuth tokens and marks mailbox disabled.
   */
  static async disconnectMailbox(userId: string, mailboxId: string): Promise<void> {
    const [mailbox] = await db
      .select()
      .from(userMailboxAccounts)
      .where(and(eq(userMailboxAccounts.id, mailboxId), eq(userMailboxAccounts.userId, userId)));

    if (!mailbox) {
      throw new Error("Mailbox connection not found");
    }

    const refreshToken = decryptToken(mailbox.refreshTokenEncrypted);
    if (refreshToken) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
      } catch {
        // Silently proceed if revocation endpoint fails
      }
    }

    await db.delete(userMailboxAccounts).where(eq(userMailboxAccounts.id, mailboxId));
  }
}

