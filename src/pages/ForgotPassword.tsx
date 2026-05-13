import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import LexSentinelLogo from "@/components/LexSentinelLogo";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import TurnstileWidget from "@/components/TurnstileWidget";

const ForgotPassword = () => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const handleCaptchaVerify = useCallback((token: string) => setCaptchaToken(token), []);
  const handleCaptchaExpire = useCallback(() => setCaptchaToken(null), []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaToken) {
      toast({ title: "Verification required", description: "Please complete the human verification challenge.", variant: "destructive" });
      return;
    }
    setLoading(true);

    const isDevBypass = captchaToken === "dev-bypass-token";
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
      ...(isDevBypass ? {} : { captchaToken }),
    });

    setLoading(false);
    setCaptchaToken(null);

    if (error) {
      toast({ title: "Request failed", description: error.message, variant: "destructive" });
    } else {
      setSent(true);
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
              <h2 className="text-2xl font-semibold text-foreground">Reset password</h2>
              <p className="text-sm text-muted-foreground">
                {sent
                  ? "Check your inbox for a reset link"
                  : "Enter your email to receive a password reset link"}
              </p>
            </CardHeader>
            <CardContent>
              {sent ? (
                <div className="text-center space-y-4">
                  <div className="mx-auto w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
                    <Mail size={32} className="text-accent" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    We've sent a password reset link to <strong className="text-foreground">{email}</strong>.
                    Please check your inbox and spam folder.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => { setSent(false); setEmail(""); }}
                  >
                    Send again
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@lexsentinel.co.uk"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                   </div>
                   <TurnstileWidget onVerify={handleCaptchaVerify} onExpire={handleCaptchaExpire} onError={handleCaptchaExpire} />
                   <Button
                     type="submit"
                     className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                     disabled={loading || !captchaToken}
                   >
                     {loading ? "Sending…" : "Send reset link"}
                   </Button>
                </form>
              )}
              <div className="mt-6 text-center">
                <Link
                  to="/login"
                  className="text-sm text-accent hover:underline font-medium inline-flex items-center gap-1"
                >
                  <ArrowLeft size={14} />
                  Back to sign in
                </Link>
              </div>
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

export default ForgotPassword;
