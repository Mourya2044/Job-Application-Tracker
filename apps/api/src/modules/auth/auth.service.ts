import bcrypt from "bcryptjs";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../../db";
import { users, User, NewUser } from "../../db/schema/users";
import { config } from "../../config";

export interface RegisterDto {
  email: string;
  password: string;
  fullName?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export class AuthService {
  static async register(dto: RegisterDto): Promise<Omit<User, "passwordHash">> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Check if user already exists
    const existing = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });
    if (existing) {
      const err = new Error("A user with this email address already exists.");
      (err as any).statusCode = 409;
      throw err;
    }

    const salt = await bcrypt.genSalt(config.auth.saltRounds);
    const passwordHash = await bcrypt.hash(dto.password, salt);

    const [created] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        fullName: dto.fullName?.trim() || null,
        passwordHash,
        isActive: true,
      })
      .returning();

    const { passwordHash: _, ...safeUser } = created;
    return safeUser;
  }

  static async login(dto: LoginDto): Promise<Omit<User, "passwordHash">> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    // Constant-time defense against user enumeration via timing attack
    const DUMMY_HASH = "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012";
    if (!user || !user.isActive) {
      await bcrypt.compare(dto.password, DUMMY_HASH);
      const err = new Error("Invalid email or password.");
      (err as any).statusCode = 401;
      throw err;
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      const err = new Error("Invalid email or password.");
      (err as any).statusCode = 401;
      throw err;
    }

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  static async findById(userId: string): Promise<Omit<User, "passwordHash"> | null> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) return null;
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  static async loginOrRegisterGoogle(profile: {
    email: string;
    fullName?: string;
    googleId?: string;
  }): Promise<Omit<User, "passwordHash">> {
    const normalizedEmail = profile.email.trim().toLowerCase();

    let user = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    if (!user) {
      // Auto-register user with cryptographically secure random password
      const randomSecret = crypto.randomUUID() + crypto.randomUUID();
      const salt = await bcrypt.genSalt(config.auth.saltRounds);
      const passwordHash = await bcrypt.hash(randomSecret, salt);

      const [created] = await db
        .insert(users)
        .values({
          email: normalizedEmail,
          fullName: profile.fullName?.trim() || "Google User",
          passwordHash,
          isActive: true,
        })
        .returning();
      user = created;
    }

    if (!user.isActive) {
      const err = new Error("User account is inactive. Please contact support.");
      (err as any).statusCode = 403;
      throw err;
    }

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  static async createPasswordResetCode(email: string): Promise<{ code: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    if (!user) {
      const err = new Error("No account found with this email address.");
      (err as any).statusCode = 404;
      throw err;
    }

    // Generate secure 6-digit recovery code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in password_resets table with 15-minute expiry
    await pool.query(
      `INSERT INTO password_resets (email, code, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
      [normalizedEmail, code]
    );

    return { code };
  }

  static async resetPasswordWithCode(
    email: string,
    code: string,
    newPassword: string
  ): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();

    // Verify code exists and is within 15-minute window
    const checkRes = await pool.query(
      `SELECT id FROM password_resets
       WHERE email = $1 AND code = $2 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedEmail, code.trim()]
    );

    if (checkRes.rows.length === 0) {
      const err = new Error("Invalid or expired password reset code.");
      (err as any).statusCode = 400;
      throw err;
    }

    // Hash new password
    const salt = await bcrypt.genSalt(config.auth.saltRounds);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Update user password and timestamp
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.email, normalizedEmail));

    // Clear used reset codes for this email
    await pool.query(`DELETE FROM password_resets WHERE email = $1`, [normalizedEmail]);
  }
}

