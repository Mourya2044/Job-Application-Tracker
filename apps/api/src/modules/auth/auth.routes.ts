import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AuthService } from "./auth.service";
import { config } from "../../config";

const RegisterSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  fullName: z.string().optional(),
});

const LoginSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
});

const ResetPasswordSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
  code: z.string().min(4, "Recovery code is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters long"),
});

const GoogleAuthSchema = z.object({
  credential: z.string().optional(),
  code: z.string().optional(),
});

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 1. Register
  fastify.post(
    "/register",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
      schema: {
        description: "Register a new user account",
        tags: ["auth"],
        summary: "User registration",
      },
    },
    async (request, reply) => {
      const parsed = RegisterSchema.parse(request.body);
      const user = await AuthService.register(parsed);

      const token = fastify.jwt.sign(
        {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        },
        { expiresIn: config.auth.sessionExpiresIn }
      );

      reply.setCookie("access_token", token, {
        path: "/",
        httpOnly: true,
        secure: config.isProduction,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      return reply.status(201).send({
        user,
        token,
      });
    }
  );

  // 2. Login
  fastify.post(
    "/login",
    {
      config: {
        rateLimit: {
          max: 15,
          timeWindow: "1 minute",
        },
      },
      schema: {
        description: "Log in with email and password",
        tags: ["auth"],
        summary: "User login",
      },
    },
    async (request, reply) => {
      const parsed = LoginSchema.parse(request.body);
      const user = await AuthService.login(parsed);

      const token = fastify.jwt.sign(
        {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        },
        { expiresIn: config.auth.sessionExpiresIn }
      );

      reply.setCookie("access_token", token, {
        path: "/",
        httpOnly: true,
        secure: config.isProduction,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      return reply.send({
        user,
        token,
      });
    }
  );

  // 3. Current User Profile
  fastify.get(
    "/me",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Get authenticated user profile",
        tags: ["auth"],
        summary: "Current user profile",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const user = await AuthService.findById(request.user.id);
      if (!user) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "User account no longer exists.",
        });
      }
      return reply.send({ user });
    }
  );

  // 4. Logout
  fastify.post(
    "/logout",
    {
      schema: {
        description: "Clear authentication session and cookies",
        tags: ["auth"],
        summary: "User logout",
      },
    },
    async (request, reply) => {
      reply.clearCookie("access_token", {
        path: "/",
        httpOnly: true,
        secure: config.isProduction,
        sameSite: "lax",
      });
      return reply.send({ message: "Successfully logged out." });
    }
  );

  // 5. Google Login / Registration (Post Credential ID Token or Code)
  fastify.post(
    "/google",
    {
      schema: {
        description: "Authenticate or register user with Google OAuth credential token or auth code",
        tags: ["auth"],
        summary: "Google OAuth sign-in/registration",
      },
    },
    async (request, reply) => {
      const { credential, code } = GoogleAuthSchema.parse(request.body);

      let profile: { email: string; fullName?: string; googleId?: string };

      if (credential) {
        // Direct Google Identity Services ID Token verification
        const verifyRes = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
        );
        if (!verifyRes.ok) {
          const err = new Error("Invalid or expired Google identity credential.");
          (err as any).statusCode = 401;
          throw err;
        }
        const tokenInfo = (await verifyRes.json()) as {
          email?: string;
          email_verified?: string;
          name?: string;
          sub?: string;
        };

        if (!tokenInfo.email || tokenInfo.email_verified !== "true") {
          const err = new Error("Google email is unverified or missing.");
          (err as any).statusCode = 400;
          throw err;
        }

        profile = {
          email: tokenInfo.email,
          fullName: tokenInfo.name,
          googleId: tokenInfo.sub,
        };
      } else if (code) {
        // Exchange authorization code for tokens
        const redirectUri = config.isProduction
          ? "https://track.mourya.tech/api/auth/google/callback"
          : `http://${request.headers.host || "localhost:3000"}/api/auth/google/callback`;

        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: config.google.clientId,
            client_secret: config.google.clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        });

        if (!tokenRes.ok) {
          const err = new Error("Failed to exchange Google authorization code.");
          (err as any).statusCode = 400;
          throw err;
        }

        const tokenData = (await tokenRes.json()) as { access_token: string };
        const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        if (!userinfoRes.ok) {
          const err = new Error("Failed to fetch Google profile.");
          (err as any).statusCode = 400;
          throw err;
        }

        const userinfo = (await userinfoRes.json()) as {
          email?: string;
          email_verified?: boolean;
          name?: string;
          sub?: string;
        };

        if (!userinfo.email) {
          const err = new Error("Google account did not provide an email address.");
          (err as any).statusCode = 400;
          throw err;
        }

        profile = {
          email: userinfo.email,
          fullName: userinfo.name,
          googleId: userinfo.sub,
        };
      } else {
        const err = new Error("Either Google credential or authorization code is required.");
        (err as any).statusCode = 400;
        throw err;
      }

      const user = await AuthService.loginOrRegisterGoogle(profile);

      const token = fastify.jwt.sign(
        {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        },
        { expiresIn: config.auth.sessionExpiresIn }
      );

      reply.setCookie("access_token", token, {
        path: "/",
        httpOnly: true,
        secure: config.isProduction,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.send({ user, token });
    }
  );

  // 6. Google OAuth Redirect (Browser initiate)
  fastify.get(
    "/google",
    {
      schema: {
        description: "Redirect to Google OAuth consent page",
        tags: ["auth"],
        summary: "Initiate Google OAuth login",
      },
    },
    async (request, reply) => {
      const redirectUri = config.isProduction
        ? "https://track.mourya.tech/api/auth/google/callback"
        : `http://${request.headers.host || "localhost:3000"}/api/auth/google/callback`;

      const googleAuthUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(config.google.clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent("openid email profile")}` +
        `&access_type=offline` +
        `&prompt=select_account`;

      return reply.redirect(googleAuthUrl);
    }
  );

  // 7. Google OAuth Callback (Browser redirect receiver)
  fastify.get(
    "/google/callback",
    {
      schema: {
        description: "Google OAuth redirect callback receiver",
        tags: ["auth"],
        summary: "Google OAuth callback handler",
      },
    },
    async (request, reply) => {
      const { code } = request.query as { code?: string };
      if (!code) {
        return reply.redirect("/?error=google_auth_failed");
      }

      const redirectUri = config.isProduction
        ? "https://track.mourya.tech/api/auth/google/callback"
        : `http://${request.headers.host || "localhost:3000"}/api/auth/google/callback`;

      try {
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: config.google.clientId,
            client_secret: config.google.clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        });

        if (!tokenRes.ok) {
          return reply.redirect("/?error=token_exchange_failed");
        }

        const tokenData = (await tokenRes.json()) as { access_token: string };
        const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        const userinfo = (await userinfoRes.json()) as {
          email?: string;
          name?: string;
          sub?: string;
        };

        if (!userinfo.email) {
          return reply.redirect("/?error=missing_email");
        }

        const user = await AuthService.loginOrRegisterGoogle({
          email: userinfo.email,
          fullName: userinfo.name,
          googleId: userinfo.sub,
        });

        const token = fastify.jwt.sign(
          {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
          },
          { expiresIn: config.auth.sessionExpiresIn }
        );

        reply.setCookie("access_token", token, {
          path: "/",
          httpOnly: true,
          secure: config.isProduction,
          sameSite: "lax",
          maxAge: 7 * 24 * 60 * 60,
        });

        return reply.redirect("/");
      } catch (err) {
        request.log.error({ err }, "Google OAuth callback error");
        return reply.redirect("/?error=authentication_failed");
      }
    }
  );

  // 8. Forgot Password (Request 6-digit Recovery Code)
  fastify.post(
    "/forgot-password",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
        },
      },
      schema: {
        description: "Generate a 6-digit recovery code for password reset",
        tags: ["auth"],
        summary: "Forgot password request",
      },
    },
    async (request, reply) => {
      const { email } = ForgotPasswordSchema.parse(request.body);
      const { code } = await AuthService.createPasswordResetCode(email);

      return reply.send({
        success: true,
        message: "A 6-digit password recovery code has been generated.",
        code, // Returned for instant user feedback and testing
      });
    }
  );

  // 9. Reset Password (Verify Code & Update Password)
  fastify.post(
    "/reset-password",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
      schema: {
        description: "Reset password using 6-digit recovery code",
        tags: ["auth"],
        summary: "Reset user password",
      },
    },
    async (request, reply) => {
      const { email, code, newPassword } = ResetPasswordSchema.parse(request.body);
      await AuthService.resetPasswordWithCode(email, code, newPassword);

      return reply.send({
        success: true,
        message: "Your password has been reset successfully. You can now log in.",
      });
    }
  );
};


