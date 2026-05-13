import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Gift, CheckCircle2, Loader2, Briefcase, User, Mail, Building2, MapPin, Phone, Users, Megaphone, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import LexSentinelLogo from "@/components/LexSentinelLogo";
import PublicNav from "@/components/PublicNav";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import TurnstileWidget from "@/components/TurnstileWidget";
import { z } from "zod";
import { sanitiseName, sanitisePhone } from "@/lib/validation";

const NAME_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ' \-]+$/;
const UK_PHONE_REGEX = /^(?:\+44|0)\d{9,13}$/;

const freeTrialSchema = z.object({
  full_name: z.string().trim().min(2, "Name must be at least 2 characters").max(200).regex(NAME_REGEX, "Name must contain only letters, spaces, hyphens and apostrophes"),
  email: z.string().trim().email("Please enter a valid email address").max(255),
  phone: z.string().trim().transform((v) => v.replace(/[\s\-()]/g, "")).refine((v) => !v || UK_PHONE_REGEX.test(v), "Please enter a valid UK phone number").default(""),
  firm_name: z.string().trim().min(1, "Firm name is required").max(200),
  position: z.string().min(1, "Please select your position"),
  firm_size: z.string().min(1, "Please select your firm size"),
  monthly_cases: z.string().min(1, "Please select your monthly case volume"),
  current_tools: z.string().max(500).optional().default(""),
  referral_source: z.string().min(1, "Please tell us how you heard about us"),
});

const POSITIONS = [
  "Solicitor — Partner",
  "Solicitor — Associate",
  "Solicitor — Newly Qualified",
  "Licensed Conveyancer",
  "Trainee Solicitor",
  "Legal Executive (CILEx)",
  "Paralegal",
  "Conveyancing Assistant",
  "Practice Manager",
  "Head of Conveyancing",
  "Managing Director",
  "IT / Innovation Lead",
  "Other",
];

const FIRM_SIZES = [
  { value: "sole", label: "Sole practitioner" },
  { value: "2-5", label: "2–5 fee earners" },
  { value: "6-15", label: "6–15 fee earners" },
  { value: "16-50", label: "16–50 fee earners" },
  { value: "51-100", label: "51–100 fee earners" },
  { value: "100+", label: "100+ fee earners" },
];

const REFERRAL_SOURCES = [
  "LinkedIn",
  "Google Search",
  "Industry event or conference",
  "Word of mouth / colleague",
  "Legal press (e.g. Law Society Gazette, Today's Conveyancer)",
  "Social media (Twitter/X, Facebook)",
  "Email or newsletter",
  "Webinar or podcast",
  "SRA / CLC / professional body",
  "Other",
];

const CURRENT_TOOLS = [
  { value: "manual", label: "Fully manual (no tech)" },
  { value: "case_management", label: "Case management system only (e.g. Proclaim, Leap)" },
  { value: "search_provider", label: "Search provider portal (e.g. InfoTrack, SearchFlow)" },
  { value: "ai_other", label: "Another AI tool" },
  { value: "mixed", label: "Mix of tools" },
];

const CASE_VOLUMES = [
  { value: "1-10", label: "1–10 cases/month" },
  { value: "11-30", label: "11–30 cases/month" },
  { value: "31-50", label: "31–50 cases/month" },
  { value: "51-100", label: "51–100 cases/month" },
  { value: "100+", label: "100+ cases/month" },
];

const BENEFITS = [
  "100 free AI credits — enough for multiple full case reviews",
  "Full access to the Olimey AI agent",
  "No credit card required",
  "Risk-scored reports in under 5 minutes",
  "See exactly how much time your firm could save",
];

const FreeTrial = () => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    firm_name: "",
    position: "",
    firm_size: "",
    monthly_cases: "",
    current_tools: "",
    referral_source: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const handleCaptchaVerify = useCallback((token: string) => setCaptchaToken(token), []);
  const handleCaptchaExpire = useCallback(() => setCaptchaToken(null), []);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!captchaToken) {
      toast({ title: "Verification required", description: "Please complete the human verification challenge.", variant: "destructive" });
      return;
    }

    const result = freeTrialSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as string;
        if (!fieldErrors[field]) fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("free_trial_requests" as any)
        .insert(result.data as any);

      if (error) throw error;

      setSubmitted(true);
      toast({
        title: "Free trial request submitted!",
        description: "We'll be in touch shortly with your 100 free credits.",
      });
    } catch (err: any) {
      toast({
        title: "Something went wrong",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <main className="max-w-5xl mx-auto px-4 py-12 pt-24">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Left — Value prop */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-sm font-medium">
              <Gift size={15} />
              Free Trial — 100 Credits
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
              Try Olimey AI with{" "}
              <span className="text-gradient">100 free credits</span>
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Experience AI-powered property search review on a real case — no commitment, no credit card. See how Olimey AI can transform your conveyancing workflow.
            </p>

            <ul className="space-y-3">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-start gap-3">
                  <CheckCircle2 size={18} className="text-accent mt-0.5 shrink-0" />
                  <span className="text-sm text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>{benefit}</span>
                </li>
              ))}
            </ul>

            <div className="rounded-xl border border-border bg-card p-5 space-y-2">
              <p className="text-sm font-semibold text-foreground">What happens next?</p>
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                <li>We'll review your request and set up your account</li>
                <li>You'll receive 100 free credits — enough for multiple full case reviews</li>
                <li>Upload your documents and see AI analysis in under 5 minutes</li>
              </ol>
            </div>
          </motion.div>

          {/* Right — Form */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {submitted ? (
              <Card className="border-accent/30">
                <CardContent className="pt-8 pb-8 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto">
                    <CheckCircle2 size={32} className="text-accent" />
                  </div>
                  <h2 className="text-2xl font-bold text-foreground">You're on the list!</h2>
                  <p className="text-muted-foreground max-w-sm mx-auto" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    We'll review your request and get back to you shortly with your free trial access and 100 credits.
                  </p>
                  <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90 mt-2">
                    <Link to="/signup">
                      Explore AI Agents
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border">
                <CardContent className="pt-6 space-y-5">
                  <div className="space-y-1">
                    <h2 className="text-xl font-bold text-foreground">Start your free trial</h2>
                    <p className="text-sm text-muted-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                      Fill in your details and we'll set up your account with 100 free credits.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="full_name" className="flex items-center gap-1.5 text-sm">
                        <User size={14} className="text-muted-foreground" /> Full Name
                      </Label>
                      <Input
                        id="full_name"
                        value={form.full_name}
                        onChange={(e) => handleChange("full_name", sanitiseName(e.target.value))}
                        placeholder="e.g. Sarah Williams"
                        maxLength={200}
                        className={errors.full_name ? "border-destructive" : ""}
                      />
                      {errors.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="flex items-center gap-1.5 text-sm">
                        <Mail size={14} className="text-muted-foreground" /> Work Email
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        value={form.email}
                        onChange={(e) => handleChange("email", e.target.value)}
                        placeholder="e.g. sarah@lawfirm.co.uk"
                        className={errors.email ? "border-destructive" : ""}
                      />
                      {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="firm_name" className="flex items-center gap-1.5 text-sm">
                        <Building2 size={14} className="text-muted-foreground" /> Firm Name
                      </Label>
                      <Input
                        id="firm_name"
                        value={form.firm_name}
                        onChange={(e) => handleChange("firm_name", e.target.value)}
                        placeholder="e.g. Williams & Partners Solicitors"
                        className={errors.firm_name ? "border-destructive" : ""}
                      />
                      {errors.firm_name && <p className="text-xs text-destructive">{errors.firm_name}</p>}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5 text-sm">
                        <Briefcase size={14} className="text-muted-foreground" /> Position in Firm
                      </Label>
                      <Select value={form.position} onValueChange={(v) => handleChange("position", v)}>
                        <SelectTrigger className={errors.position ? "border-destructive" : ""}>
                          <SelectValue placeholder="Select your position" />
                        </SelectTrigger>
                        <SelectContent>
                          {POSITIONS.map((pos) => (
                            <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.position && <p className="text-xs text-destructive">{errors.position}</p>}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="phone" className="flex items-center gap-1.5 text-sm">
                        <Phone size={14} className="text-muted-foreground" /> Phone Number <span className="text-muted-foreground text-xs">(optional)</span>
                      </Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={form.phone}
                        onChange={(e) => handleChange("phone", sanitisePhone(e.target.value))}
                        maxLength={20}
                        placeholder="e.g. 07700 900000"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5 text-sm">
                        <Users size={14} className="text-muted-foreground" /> Firm Size
                      </Label>
                      <Select value={form.firm_size} onValueChange={(v) => handleChange("firm_size", v)}>
                        <SelectTrigger className={errors.firm_size ? "border-destructive" : ""}>
                          <SelectValue placeholder="Select firm size" />
                        </SelectTrigger>
                        <SelectContent>
                          {FIRM_SIZES.map((fs) => (
                            <SelectItem key={fs.value} value={fs.value}>{fs.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.firm_size && <p className="text-xs text-destructive">{errors.firm_size}</p>}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5 text-sm">
                        <MapPin size={14} className="text-muted-foreground" /> Monthly Case Volume
                      </Label>
                      <Select value={form.monthly_cases} onValueChange={(v) => handleChange("monthly_cases", v)}>
                        <SelectTrigger className={errors.monthly_cases ? "border-destructive" : ""}>
                          <SelectValue placeholder="Select your case volume" />
                        </SelectTrigger>
                        <SelectContent>
                          {CASE_VOLUMES.map((vol) => (
                            <SelectItem key={vol.value} value={vol.value}>{vol.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.monthly_cases && <p className="text-xs text-destructive">{errors.monthly_cases}</p>}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5 text-sm">
                        <Wrench size={14} className="text-muted-foreground" /> Current Search Review Process <span className="text-muted-foreground text-xs">(optional)</span>
                      </Label>
                      <Select value={form.current_tools} onValueChange={(v) => handleChange("current_tools", v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="How do you review searches today?" />
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENT_TOOLS.map((tool) => (
                            <SelectItem key={tool.value} value={tool.value}>{tool.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5 text-sm">
                        <Megaphone size={14} className="text-muted-foreground" /> How did you hear about us?
                      </Label>
                      <Select value={form.referral_source} onValueChange={(v) => handleChange("referral_source", v)}>
                        <SelectTrigger className={errors.referral_source ? "border-destructive" : ""}>
                          <SelectValue placeholder="Select an option" />
                        </SelectTrigger>
                        <SelectContent>
                          {REFERRAL_SOURCES.map((src) => (
                            <SelectItem key={src} value={src}>{src}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.referral_source && <p className="text-xs text-destructive">{errors.referral_source}</p>}
                    </div>

                    <TurnstileWidget onVerify={handleCaptchaVerify} onExpire={handleCaptchaExpire} onError={handleCaptchaExpire} />

                    <Button
                      type="submit"
                      disabled={submitting || !captchaToken}
                      className="w-full bg-accent text-accent-foreground hover:bg-accent/90 h-11 text-base"
                    >
                      {submitting ? (
                        <>
                          <Loader2 size={16} className="mr-2 animate-spin" />
                          Submitting…
                        </>
                      ) : (
                        <>
                          <Gift size={16} className="mr-2" />
                          Claim Your 100 Free Credits
                        </>
                      )}
                    </Button>

                    <p className="text-[11px] text-center text-muted-foreground">
                      By submitting you agree to our{" "}
                      <Link to="/terms" className="text-accent hover:underline">Terms</Link> and{" "}
                      <Link to="/privacy" className="text-accent hover:underline">Privacy Policy</Link>.
                    </p>
                  </form>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </div>
      </main>

      <footer className="border-t border-border py-6 mt-16">
        <p className="text-center text-xs text-muted-foreground">
          © 2026 Olimey AI ·{" "}
          <Link to="/terms" className="text-accent hover:underline">Terms</Link>
          {" · "}
          <Link to="/privacy" className="text-accent hover:underline">Privacy</Link>
        </p>
      </footer>
    </div>
  );
};

export default FreeTrial;
