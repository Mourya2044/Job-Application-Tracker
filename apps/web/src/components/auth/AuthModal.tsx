import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { X, Lock, Mail, User, AlertCircle, CheckCircle, KeyRound, ArrowLeft } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "login" | "register" | "forgot";
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = "login",
}) => {
  const { login, register, forgotPassword, resetPassword, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState<"login" | "register" | "forgot">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [forgotStep, setForgotStep] = useState<"request" | "reset">("request");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      if (mode === "login") {
        await login(email, password);
        onClose();
      } else if (mode === "register") {
        if (!fullName.trim()) {
          setError("Full name is required");
          setSubmitting(false);
          return;
        }
        await register(email, password, fullName);
        onClose();
      } else if (mode === "forgot") {
        if (forgotStep === "request") {
          const res = await forgotPassword(email);
          setSuccessMsg(res.message + (res.code ? ` (Code: ${res.code})` : ""));
          if (res.code) {
            setRecoveryCode(res.code);
          }
          setForgotStep("reset");
        } else {
          const res = await resetPassword(email, recoveryCode, newPassword);
          setSuccessMsg(res.message || "Password reset successfully! You can now log in.");
          setPassword(newPassword);
          setTimeout(() => {
            setMode("login");
            setForgotStep("request");
            setSuccessMsg("Password reset completed. Please sign in with your new password.");
          }, 1500);
        }
      }
    } catch (err: any) {
      setError(err?.message || err?.error || "Action failed. Please check your inputs.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-[#131926] border border-[#253048] rounded-xl shadow-2xl p-6 overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-md text-[#8f9cb5] hover:text-[#f1ede6] hover:bg-[#1a2235] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Tabs */}
        {mode !== "forgot" ? (
          <div className="flex border-b border-[#253048] mb-6">
            <button
              onClick={() => {
                setMode("login");
                setError(null);
                setSuccessMsg(null);
              }}
              className={`pb-3 text-sm font-medium border-b-2 transition-all mr-6 ${
                mode === "login"
                  ? "border-[#d4a853] text-[#f1ede6]"
                  : "border-transparent text-[#8f9cb5] hover:text-[#f1ede6]"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setMode("register");
                setError(null);
                setSuccessMsg(null);
              }}
              className={`pb-3 text-sm font-medium border-b-2 transition-all ${
                mode === "register"
                  ? "border-[#d4a853] text-[#f1ede6]"
                  : "border-transparent text-[#8f9cb5] hover:text-[#f1ede6]"
              }`}
            >
              Create Account
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 mb-6 border-b border-[#253048] pb-3">
            <button
              onClick={() => {
                setMode("login");
                setError(null);
                setSuccessMsg(null);
                setForgotStep("request");
              }}
              className="p-1 rounded text-[#8f9cb5] hover:text-[#f1ede6] hover:bg-[#1a2235] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-[#f1ede6]">
              {forgotStep === "request" ? "Reset Your Password" : "Enter Recovery Code"}
            </span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-md bg-[#fb7185]/10 border border-[#fb7185]/30 text-[#fb7185] text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMsg && (
          <div className="mb-4 p-3 rounded-md bg-[#10b981]/10 border border-[#10b981]/30 text-[#10b981] text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Google One-Click Sign In (for login & register) */}
        {mode !== "forgot" && (
          <div className="mb-4">
            <button
              type="button"
              onClick={loginWithGoogle}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-[#1a2235] hover:bg-[#202b42] border border-[#253048] rounded-md text-sm font-medium text-[#f1ede6] transition-colors shadow-sm"
            >
              {/* Google SVG Logo */}
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{mode === "login" ? "Sign in with Google" : "Sign up with Google"}</span>
            </button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#253048]" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-[#131926] px-2 text-[#57647d]">or continue with email</span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="block text-xs font-medium text-[#8f9cb5] mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 w-4 h-4 text-[#57647d]" />
                <input
                  type="text"
                  required
                  placeholder="Jane Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[#0c1019] border border-[#253048] rounded-md text-sm text-[#f1ede6] placeholder-[#57647d] focus:outline-none focus:border-[#d4a853] transition-colors"
                />
              </div>
            </div>
          )}

          {/* Email field (for login, register, and forgot-request) */}
          {(mode !== "forgot" || forgotStep === "request") && (
            <div>
              <label className="block text-xs font-medium text-[#8f9cb5] mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-[#57647d]" />
                <input
                  type="email"
                  required
                  placeholder="developer@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[#0c1019] border border-[#253048] rounded-md text-sm text-[#f1ede6] placeholder-[#57647d] focus:outline-none focus:border-[#d4a853] transition-colors"
                />
              </div>
            </div>
          )}

          {/* Password field (for login & register) */}
          {mode !== "forgot" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-[#8f9cb5]">
                  Password
                </label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setError(null);
                      setSuccessMsg(null);
                      setForgotStep("request");
                    }}
                    className="text-xs text-[#d4a853] hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-[#57647d]" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[#0c1019] border border-[#253048] rounded-md text-sm text-[#f1ede6] placeholder-[#57647d] focus:outline-none focus:border-[#d4a853] transition-colors"
                />
              </div>
              {mode === "register" && (
                <p className="text-[11px] text-[#57647d] mt-1">
                  Must be at least 8 characters.
                </p>
              )}
            </div>
          )}

          {/* Forgot Password - Step 2: Code and New Password */}
          {mode === "forgot" && forgotStep === "reset" && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#8f9cb5] mb-1.5">
                  6-Digit Recovery Code
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-[#57647d]" />
                  <input
                    type="text"
                    required
                    placeholder="123456"
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-[#0c1019] border border-[#253048] rounded-md text-sm text-[#f1ede6] placeholder-[#57647d] tracking-widest font-mono focus:outline-none focus:border-[#d4a853] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#8f9cb5] mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-4 h-4 text-[#57647d]" />
                  <input
                    type="password"
                    required
                    placeholder="Minimum 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-[#0c1019] border border-[#253048] rounded-md text-sm text-[#f1ede6] placeholder-[#57647d] focus:outline-none focus:border-[#d4a853] transition-colors"
                  />
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-2 py-2.5 rounded-md bg-[#d4a853] text-[#080b12] text-sm font-semibold hover:bg-[#e6c06a] focus:outline-none transition-colors disabled:opacity-50"
          >
            {submitting
              ? "Processing..."
              : mode === "login"
              ? "Sign In"
              : mode === "register"
              ? "Create Account"
              : forgotStep === "request"
              ? "Send Recovery Code"
              : "Reset Password"}
          </button>
        </form>
      </div>
    </div>
  );
};
