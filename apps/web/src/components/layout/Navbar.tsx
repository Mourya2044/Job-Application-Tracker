import React from "react";
import { useAuth } from "../../context/AuthContext";
import {
  Briefcase,
  Layers,
  Search,
  Mail,
  Sparkles,
  LogOut,
  User as UserIcon,
  Activity,
} from "lucide-react";

export type NavTab = "dashboard" | "applications" | "jobs" | "mailbox" | "ai";

interface NavbarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onOpenAuth: (mode: "login" | "register") => void;
  onOpenNewApp: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  onOpenAuth,
  onOpenNewApp,
}) => {
  const { user, logout } = useAuth();

  const navItems: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "Dashboard", icon: <Activity className="w-4 h-4" /> },
    { id: "applications", label: "Applications", icon: <Layers className="w-4 h-4" /> },
    { id: "jobs", label: "Job Discovery", icon: <Search className="w-4 h-4" /> },
    { id: "mailbox", label: "Mailbox Sync", icon: <Mail className="w-4 h-4" /> },
    { id: "ai", label: "AI Copilot", icon: <Sparkles className="w-4 h-4 text-[#d4a853]" /> },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#253048] bg-[#0c1019]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-8">
          <div
            onClick={() => onTabChange("dashboard")}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-lg bg-[#131926] border border-[#253048] flex items-center justify-center text-[#d4a853] group-hover:border-[#d4a853]/60 transition-colors">
              <Briefcase className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold text-lg tracking-tight text-[#f1ede6]">TRACK</span>
              <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-[#1a2235] text-[#d4a853] font-mono border border-[#253048]">
                v2.0
              </span>
            </div>
          </div>

          {/* Nav Items */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all ${
                    isActive
                      ? "bg-[#1a2235] text-[#d4a853] border border-[#253048]"
                      : "text-[#8f9cb5] hover:text-[#f1ede6] hover:bg-[#131926]"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <button
                onClick={onOpenNewApp}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#d4a853] text-[#080b12] text-sm font-medium hover:bg-[#e6c06a] transition-colors shadow-sm"
              >
                + Add Application
              </button>
              <div className="flex items-center gap-2 pl-3 border-l border-[#253048]">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs font-medium text-[#f1ede6] leading-none">
                    {user.fullName || user.email.split("@")[0]}
                  </span>
                  <span className="text-[11px] text-[#57647d] leading-none mt-1">
                    {user.email}
                  </span>
                </div>
                <button
                  onClick={() => logout()}
                  title="Sign out"
                  className="p-1.5 rounded-md text-[#8f9cb5] hover:text-[#fb7185] hover:bg-[#131926] transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenAuth("login")}
                className="px-3.5 py-1.5 text-sm font-medium text-[#f1ede6] hover:bg-[#131926] rounded-md transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => onOpenAuth("register")}
                className="px-3.5 py-1.5 text-sm font-medium bg-[#d4a853] text-[#080b12] rounded-md hover:bg-[#e6c06a] transition-colors"
              >
                Create Account
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

