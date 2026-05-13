import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import LexSentinelLogo from "@/components/LexSentinelLogo";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import TurnstileWidget from "@/components/TurnstileWidget";

const Login = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { session, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const handleCaptchaVerify = useCallback((token: string) => setCaptchaToken(token), []);
  const handleCaptchaExpire = useCallback(() => setCaptchaToken(null), []);

  // Redirect when session is established
  useEffect(() => {
    if (!authLoading && session) {
      navigate("/dashboard", { replace: true });
    }
  }, [session, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaToken) {
      toast({ title: "Verification required", description: "Please complete the human verification challenge.", variant: "destructive" });
      return;
    }
    setLoading(true);

    const isDevBypass = captchaToken === "dev-bypass-token";
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: isDevBypass ? undefined : { captchaToken },
    });

    setLoading(false);
    setCaptchaToken(null);

    if (error) {
      toast({ title: "Sign in failed", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 sentinel-gradient items-center justify-center p-12 relative overflow-hidden">
        {/* Geometric pattern overlay */}
        <div className="absolute inset-0 login-pattern opacity-[0.08]" />
        {/* Accent glow */}
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px]" style={{ background: 'radial-gradient(circle at 80% 80%, hsl(22, 75%, 50%, 0.2), transparent 60%)' }} />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 text-center"
        >
          <div className="mx-auto mb-8 w-20 h-20 rounded-2xl flex items-center justify-center border-2 border-accent/30" style={{ background: "hsl(220, 35%, 18%)" }}>
            <span className="text-3xl font-bold text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>LS</span>
          </div>
          <h1 className="text-4xl font-bold text-primary-foreground mb-4 tracking-tight">
            Lex<span className="text-accent">Sentinel</span>
          </h1>
          <p className="text-primary-foreground/60 text-lg max-w-md">
            AI-powered source of wealth verification for conveyancing, with insurer-grade audit defensibility.
          </p>
          {/* Accent divider */}
          <div className="mt-8 mx-auto w-16 h-1 rounded-full bg-accent/60" />
          <div className="mt-6 flex justify-center gap-6 text-primary-foreground/40 text-xs font-medium tracking-wider uppercase" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            <span>AML Compliance</span>
            <span>·</span>
            <span>Source of Wealth</span>
            <span>·</span>
            <span>Audit Trail</span>
          </div>
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
              <h2 className="text-2xl font-semibold text-foreground">Sign in</h2>
              <p className="text-sm text-muted-foreground">Enter your credentials to access the portal</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
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
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="password">Password</Label>
                    <Link to="/forgot-password" className="text-xs text-accent hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {/* Turnstile CAPTCHA */}
                <TurnstileWidget onVerify={handleCaptchaVerify} onExpire={handleCaptchaExpire} onError={handleCaptchaExpire} />

                <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading || !captchaToken}>
                  {loading ? "Signing in…" : "Sign in"}
                  {!loading && <ArrowRight size={16} className="ml-2" />}
                </Button>
              </form>
              {/* Demo login – visible only in dev / preview */}
              {import.meta.env.DEV && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full mt-2 text-xs"
                  onClick={() => {
                    setEmail("demo@lexsentinel.co.uk");
                    setPassword("Demo1234!");
                  }}
                >
                  🔑 Fill demo credentials
                </Button>
              )}
              <div className="mt-6 text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Don't have an account?{" "}
                  <Link to="/signup" className="text-accent hover:underline font-medium">
                    Create account
                  </Link>
                </p>
                <p className="text-sm text-muted-foreground">
                  <Link to="/request-access" className="text-accent hover:underline font-medium">
                    Request access
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground mt-6">
            © 2026 Olimey AI ·{" "}
            <Link to="/terms" className="text-accent hover:underline">Terms</Link>
            {" · "}
            <Link to="/privacy" className="text-accent hover:underline">Privacy</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
