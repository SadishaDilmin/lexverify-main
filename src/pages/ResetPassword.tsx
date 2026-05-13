import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import LexSentinelLogo from "@/components/LexSentinelLogo";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const ResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event from the magic link
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    // Also check if we're already in a recovery session (hash fragment)
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please make sure both passwords are the same.", variant: "destructive" });
      return;
    }

    if (password.length < 6) {
      toast({ title: "Password too short", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      setSuccess(true);
      setTimeout(() => navigate("/login"), 3000);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 sentinel-gradient items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full border border-accent/20"
              style={{
                width: `${200 + i * 120}px`,
                height: `${200 + i * 120}px`,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }}
            />
          ))}
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 text-center"
        >
          <div className="mx-auto mb-8 w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: "hsl(220, 35%, 18%)" }}>
            <span className="text-3xl font-bold text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>LS</span>
          </div>
          <h1 className="text-4xl font-bold text-primary-foreground mb-4 tracking-tight">
            Lex<span className="text-accent">Sentinel</span>
          </h1>
          <p className="text-primary-foreground/60 text-lg max-w-md">
            AI-powered source of wealth verification for conveyancing, with insurer-grade audit defensibility.
          </p>
        </motion.div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden mb-8">
            <LexSentinelLogo size="lg" />
          </div>

          <Card className="border-border shadow-lg">
            <CardHeader className="pb-4">
              <h2 className="text-2xl font-semibold text-foreground">
                {success ? "Password updated" : "Set new password"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {success
                  ? "Redirecting you to sign in…"
                  : "Enter your new password below"}
              </p>
            </CardHeader>
            <CardContent>
              {success ? (
                <div className="text-center space-y-4">
                  <div className="mx-auto w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
                    <CheckCircle2 size={32} className="text-accent" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Your password has been updated successfully. You'll be redirected to sign in shortly.
                  </p>
                </div>
              ) : !isRecovery ? (
                <div className="text-center space-y-4">
                  <p className="text-sm text-muted-foreground">
                    This page requires a valid password reset link. Please request a new reset link from the login page.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate("/forgot-password")}
                  >
                    Request reset link
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleUpdatePassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">New password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm new password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                    disabled={loading}
                  >
                    {loading ? "Updating…" : "Update password"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground mt-6">
            © 2026 Olimey AI
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default ResetPassword;
