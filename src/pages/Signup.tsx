import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import LexSentinelLogo from "@/components/LexSentinelLogo";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import TurnstileWidget from "@/components/TurnstileWidget";
import { validateName, validateProfessionalEmail, validatePassword, validateFirmName, validatePosition, sanitiseName } from "@/lib/validation";

const AI_DISCLAIMER_TEXT =
  "I confirm that AI-generated outputs within Olimey AI are provided solely as a professional assistance tool. They do not constitute legal advice. In accordance with my regulatory and professional obligations, I remain solely responsible for exercising independent legal judgement, reviewing, verifying, and approving all AI-generated content before it is relied upon, actioned, or communicated to any client, lender, or third party.";

const Signup = () => {
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");
  const [firmName, setFirmName] = useState("");
  const [password, setPassword] = useState("");
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [domainApproved, setDomainApproved] = useState(true);

  const handleCaptchaVerify = useCallback((token: string) => setCaptchaToken(token), []);
  const handleCaptchaExpire = useCallback(() => setCaptchaToken(null), []);

  const validateAll = (): boolean => {
    const errors: Record<string, string> = {};
    const nameErr = validateName(fullName, "Full name");
    if (nameErr) errors.fullName = nameErr;
    const emailErr = validateProfessionalEmail(email);
    if (emailErr) errors.email = emailErr;
    const firmErr = validateFirmName(firmName);
    if (firmErr) errors.firmName = firmErr;
    const posErr = validatePosition(position);
    if (posErr) errors.position = posErr;
    const passErr = validatePassword(password);
    if (passErr) errors.password = passErr;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateAll()) return;

    if (!disclaimerAccepted) {
      toast({ title: "Disclaimer required", description: "You must accept the AI usage disclaimer to create an account.", variant: "destructive" });
      return;
    }
    if (!termsAccepted) {
      toast({ title: "Terms required", description: "You must accept the Terms and Conditions to create an account.", variant: "destructive" });
      return;
    }
    if (!captchaToken) {
      toast({ title: "Verification required", description: "Please complete the human verification challenge.", variant: "destructive" });
      return;
    }

    setLoading(true);

    const isDevBypass = captchaToken === "dev-bypass-token";
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName.trim(), position: position.trim(), firm_name: firmName.trim() },
        emailRedirectTo: window.location.origin,
        ...(isDevBypass ? {} : { captchaToken }),
      },
    });

    setLoading(false);

    if (error) {
      toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
    } else if (data.user && data.user.identities && data.user.identities.length === 0) {
      toast({
        title: "Email already registered",
        description: "An account with this email already exists. Please sign in instead.",
        variant: "destructive",
      });
    } else {
      setRegisteredEmail(email);

      // Check if domain is approved
      const domain = email.trim().split("@")[1]?.toLowerCase();
      const { data: approvedDomain } = await supabase
        .from("approved_domains")
        .select("id")
        .eq("domain", domain)
        .maybeSingle();

      setDomainApproved(!!approvedDomain);
      setShowVerifyDialog(true);

      // Fire-and-forget welcome email from CEO
      supabase.functions.invoke("send-welcome-email", {
        body: { fullName: fullName.trim(), email },
      }).catch((err) => console.error("Welcome email failed:", err));
    }
  };

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: "" }));
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
          <p className="text-primary-foreground/60 text-lg max-w-md mb-6">
            Risk intelligence for conveyancing. AI-powered search review with insurer-grade audit defensibility.
          </p>
          <div className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-accent/30 bg-accent/10 backdrop-blur-sm">
            <Sparkles size={16} className="text-accent" />
            <span className="text-sm font-medium text-accent">Priority Access included — be first in line for every new AI agent</span>
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
              <h2 className="text-2xl font-semibold text-foreground">Create account</h2>
              <p className="text-sm text-muted-foreground">Set up your Olimey AI credentials</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => { setFullName(sanitiseName(e.target.value)); clearFieldError("fullName"); }}
                    required
                    maxLength={200}
                    className={fieldErrors.fullName ? "border-destructive" : ""}
                  />
                  {fieldErrors.fullName && <p className="text-xs text-destructive">{fieldErrors.fullName}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@yourfirm.co.uk"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearFieldError("email"); }}
                    required
                    maxLength={255}
                    className={fieldErrors.email ? "border-destructive" : ""}
                  />
                  {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Only email domains for firms registered with the{" "}
                    <span className="font-medium text-foreground">Law Society</span> or the{" "}
                    <span className="font-medium text-foreground">Council for Licensed Conveyancers</span>{" "}
                    are currently accepted.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="firmName">Firm name (as it should appear in drafts)</Label>
                  <Input
                    id="firmName"
                    placeholder="e.g. Jones & Partners Solicitors LLP"
                    value={firmName}
                    onChange={(e) => { setFirmName(e.target.value); clearFieldError("firmName"); }}
                    required
                    maxLength={200}
                    className={fieldErrors.firmName ? "border-destructive" : ""}
                  />
                  {fieldErrors.firmName && <p className="text-xs text-destructive">{fieldErrors.firmName}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="position">Position in firm</Label>
                  <Input
                    id="position"
                    placeholder="e.g. Senior Conveyancer"
                    value={position}
                    onChange={(e) => { setPosition(e.target.value); clearFieldError("position"); }}
                    required
                    maxLength={200}
                    className={fieldErrors.position ? "border-destructive" : ""}
                  />
                  {fieldErrors.position && <p className="text-xs text-destructive">{fieldErrors.position}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearFieldError("password"); }}
                    required
                    minLength={8}
                    className={fieldErrors.password ? "border-destructive" : ""}
                  />
                  {fieldErrors.password && <p className="text-xs text-destructive">{fieldErrors.password}</p>}
                  <p className="text-[10px] text-muted-foreground">Minimum 8 characters</p>
                </div>

                {/* AI Disclaimer */}
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="disclaimer"
                      checked={disclaimerAccepted}
                      onCheckedChange={(checked) => setDisclaimerAccepted(checked === true)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="disclaimer" className="text-xs leading-relaxed text-muted-foreground cursor-pointer">
                      {AI_DISCLAIMER_TEXT}
                    </Label>
                  </div>
                </div>

                {/* Terms & Conditions */}
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="terms"
                      checked={termsAccepted}
                      onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="terms" className="text-xs leading-relaxed text-muted-foreground cursor-pointer">
                      I have read and agree to the{" "}
                      <Link to="/terms" target="_blank" className="text-accent hover:underline font-medium">
                        Terms and Conditions
                      </Link>
                      {" "}of use.
                    </Label>
                  </div>
                </div>

                {/* Turnstile CAPTCHA */}
                <TurnstileWidget onVerify={handleCaptchaVerify} onExpire={handleCaptchaExpire} onError={handleCaptchaExpire} />

                <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading || !disclaimerAccepted || !termsAccepted || !captchaToken}>
                  {loading ? "Creating account…" : "Create account"}
                  {!loading && <ArrowRight size={16} className="ml-2" />}
                </Button>
              </form>
              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link to="/login" className="text-accent hover:underline font-medium">Sign in</Link>
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
      {/* Email verification dialog */}
      <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader className="items-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-2"
            >
              <MailCheck size={32} className="text-accent" />
            </motion.div>
            <DialogTitle className="text-2xl font-bold">Thank you for signing up!</DialogTitle>
            <DialogDescription className="text-base text-muted-foreground pt-2 space-y-3">
              <p>
                We've sent a verification link to{" "}
                <span className="font-semibold text-foreground">{registeredEmail}</span>.
              </p>
              <p>
                Please check your inbox (and spam folder) and click the link to activate your account.
              </p>
              {!domainApproved && (
                <div className="rounded-lg border border-risk-amber/30 bg-risk-amber/5 p-3 text-sm text-risk-amber">
                  <p className="font-medium">Domain review required</p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    Your email domain is not yet on our approved list. After verifying your email, your account will be held for admin review. You'll be notified once approved.
                  </p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="pt-4 space-y-3">
            <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/login">
                Go to Sign In
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              Didn't receive the email? Check your spam folder or try signing up again.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Signup;
