import { useState, useCallback, useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import AiDisclaimerDialog from "@/components/AiDisclaimerDialog";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** M6 Fix: Auth timeout to prevent infinite spinner */
const AUTH_TIMEOUT_MS = 10_000;

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading, profile, user } = useAuth();
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // C3 fix: Check DB + localStorage for prior acceptance before showing dialog
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(() => {
    return localStorage.getItem("ls_disclaimer_accepted") === "true";
  });

  // M6 Fix: Start timeout when loading begins, clear when it resolves
  useEffect(() => {
    if (loading) {
      timerRef.current = setTimeout(() => setTimedOut(true), AUTH_TIMEOUT_MS);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      setTimedOut(false);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [loading]);

  // On mount, sync from profile DB state into localStorage
  useEffect(() => {
    if (profile?.ai_disclaimer_accepted_at && !disclaimerAccepted) {
      localStorage.setItem("ls_disclaimer_accepted", "true");
      setDisclaimerAccepted(true);
    }
  }, [profile?.ai_disclaimer_accepted_at]);

  const handleAcceptDisclaimer = useCallback(async () => {
    if (!user || !profile) return;
    const now = new Date().toISOString();
    // Update profile with acceptance timestamp
    await supabase
      .from("profiles")
      .update({ ai_disclaimer_accepted_at: now })
      .eq("user_id", user.id);
    // Log to audit trail for defensibility
    await supabase.from("audit_log").insert({
      event_type: "ai_disclaimer_accepted",
      user_id: user.id,
      user_name: profile.full_name || user.email || "",
      user_email: profile.email || user.email || "",
      user_position: profile.position || "",
      metadata: {
        accepted_at: now,
        session_id: session?.access_token?.slice(-12) || "unknown",
        disclaimer_version: "2.0",
      },
    });
    localStorage.setItem("ls_disclaimer_accepted", "true");
    setDisclaimerAccepted(true);
  }, [user, profile, session]);

  // M6 Fix: Show timeout error instead of infinite spinner
  if (loading && timedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertTriangle size={24} className="text-destructive" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Authentication timeout</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We couldn't verify your session. This may be due to a network issue or an expired session.
          </p>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => window.location.href = "/login"}
              className="w-full"
            >
              Go to Login
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setTimedOut(false);
                window.location.reload();
              }}
              className="w-full"
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Block inactive users (pending domain approval)
  if (profile && !profile.active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
            <span className="text-2xl">⏳</span>
          </div>
          <h2 className="text-xl font-semibold text-foreground">Account pending approval</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your email domain has not yet been verified as a registered law firm. An administrator will review your account shortly. You'll receive an email once approved.
          </p>
          <p className="text-xs text-muted-foreground">
            If you believe this is an error, please contact{" "}
            <a href="mailto:support@lexsentinel.co.uk" className="text-accent hover:underline">support@lexsentinel.co.uk</a>.
          </p>
        </div>
      </div>
    );
  }

  // Show disclaimer dialog if user hasn't accepted it this session
  if (!disclaimerAccepted) {
    return (
      <>
        <AiDisclaimerDialog open={true} onAccept={handleAcceptDisclaimer} />
      </>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
