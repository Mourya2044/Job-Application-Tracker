import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { X, Lock, Mail, User, AlertCircle, CheckCircle } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "login" | "register";
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = "login",
}) => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        if (!fullName.trim()) {
          setError("Full name is required");
          setSubmitting(false);
          return;
        }
        await register(email, password, fullName);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || err?.error || "Authentication failed. Please check your credentials.");
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
        <div className="flex border-b border-[#253048] mb-6">
          <button
            onClick={() => {
              setMode("login");
              setError(null);
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

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-md bg-[#fb7185]/10 border border-[#fb7185]/30 text-[#fb7185] text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
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

          <div>
            <label className="block text-xs font-medium text-[#8f9cb5] mb-1.5">
              Password
            </label>
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
                Must be at least 8 characters with letters, numbers, and symbols.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-2 py-2.5 rounded-md bg-[#d4a853] text-[#080b12] text-sm font-semibold hover:bg-[#e6c06a] focus:outline-none transition-colors disabled:opacity-50"
          >
            {submitting ? "Processing..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
};

