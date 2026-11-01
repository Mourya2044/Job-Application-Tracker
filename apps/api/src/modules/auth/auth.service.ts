import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../../db";
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
}

