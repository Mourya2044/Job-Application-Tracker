import React, { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Navbar, NavTab } from "./components/layout/Navbar";
import { DashboardView } from "./components/dashboard/DashboardView";
import { ApplicationsView } from "./components/applications/ApplicationsView";
import { JobDiscoveryView } from "./components/jobs/JobDiscoveryView";
import { MailboxView } from "./components/mailbox/MailboxView";
import { AICopilotView } from "./components/ai/AICopilotView";
import { AuthModal } from "./components/auth/AuthModal";

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>("dashboard");
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [isNewAppOpen, setIsNewAppOpen] = useState(false);

  const handleOpenAuth = (mode: "login" | "register") => {
    setAuthMode(mode);
    setIsAuthOpen(true);
  };

  const handleOpenNewApp = () => {
    if (!user) {
      handleOpenAuth("login");
    } else {
      setIsNewAppOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#0c1019] text-[#f1ede6] flex flex-col font-sans">
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenAuth={handleOpenAuth}
        onOpenNewApp={handleOpenNewApp}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "dashboard" && (
          <DashboardView
            onNavigate={setActiveTab}
            onOpenNewApp={handleOpenNewApp}
          />
        )}

        {activeTab === "applications" && (
          <ApplicationsView
            isModalOpen={isNewAppOpen}
            onOpenModal={() => setIsNewAppOpen(true)}
            onCloseModal={() => setIsNewAppOpen(false)}
          />
        )}

        {activeTab === "jobs" && <JobDiscoveryView />}

        {activeTab === "mailbox" && <MailboxView />}

        {activeTab === "ai" && <AICopilotView />}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#253048] py-6 text-center text-xs text-[#57647d] bg-[#080b12]">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Track Career Intelligence Platform • v2.0 Production</span>
          <span className="font-mono text-[11px]">PostgreSQL • Drizzle ORM • Fastify • FastAPI</span>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        initialMode={authMode}
        onClose={() => setIsAuthOpen(false)}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;

