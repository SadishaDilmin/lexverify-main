import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import LexSentinelLogo from "@/components/LexSentinelLogo";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import TurnstileWidget from "@/components/TurnstileWidget";
import { validateName, validateEmail, validatePosition, validateText, sanitiseName } from "@/lib/validation";

const RequestAccess = () => {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const handleCaptchaVerify = useCallback((token: string) => setCaptchaToken(token), []);
  const handleCaptchaExpire = useCallback(() => setCaptchaToken(null), []);

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!captchaToken) {
      toast({ title: "Verification required", description: "Please complete the human verification challenge.", variant: "destructive" });
      return;
    }

    const formData = new FormData(e.currentTarget);
    const fullName = (formData.get("fullName") as string) || "";
    const email = (formData.get("email") as string) || "";
    const position = (formData.get("position") as string) || "";
    const team = (formData.get("team") as string) || "";
    const reason = (formData.get("reason") as string) || "";

    // Validate
    const errors: Record<string, string> = {};
    const nameErr = validateName(fullName, "Full name");
    if (nameErr) errors.fullName = nameErr;
    const emailErr = validateEmail(email);
    if (emailErr) errors.email = emailErr;
    const posErr = validatePosition(position);
    if (posErr) errors.position = posErr;
    const reasonErr = validateText(reason, 2000, "Reason");
    if (reasonErr) errors.reason = reasonErr;

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);

    const payload = {
      full_name: fullName.trim(),
      email: email.trim(),
      position: position.trim(),
      team: team.trim() || null,
      reason: reason.trim() || null,
    };

    try {
      const { error } = await supabase.from("access_requests").insert(payload);
      if (error) throw error;
      setSubmitted(true);
    } catch (err: any) {
      toast({
        title: "Submission failed",
        description: err.message || "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <div className="mb-8">
          <LexSentinelLogo size="md" />
        </div>

        {submitted ? (
          <Card className="border-border shadow-lg text-center py-8">
            <CardContent>
              <CheckCircle2 size={48} className="text-accent mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Request Submitted</h2>
              <p className="text-muted-foreground text-sm mb-6">
                Your access request has been submitted for review. An administrator will be in touch shortly.
              </p>
              <Button variant="outline" asChild>
                <Link to="/login">
                  <ArrowLeft size={16} className="mr-2" />
                  Back to sign in
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border shadow-lg">
            <CardHeader className="pb-4">
              <h2 className="text-2xl font-semibold text-foreground">Request Access</h2>
              <p className="text-sm text-muted-foreground">
                Complete the form below and an administrator will review your request.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full name *</Label>
                  <Input
                    id="fullName"
                    name="fullName"
                    required
                    placeholder="Jane Smith"
                    maxLength={200}
                    onChange={(e) => {
                      e.target.value = sanitiseName(e.target.value);
                      clearFieldError("fullName");
                    }}
                    className={fieldErrors.fullName ? "border-destructive" : ""}
                  />
                  {fieldErrors.fullName && <p className="text-xs text-destructive">{fieldErrors.fullName}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email address *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    placeholder="j.smith@firm.co.uk"
                    maxLength={255}
                    onChange={() => clearFieldError("email")}
                    className={fieldErrors.email ? "border-destructive" : ""}
                  />
                  {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="position">Position in firm *</Label>
                  <Input
                    id="position"
                    name="position"
                    required
                    placeholder="e.g. Conveyancer"
                    maxLength={200}
                    onChange={() => clearFieldError("position")}
                    className={fieldErrors.position ? "border-destructive" : ""}
                  />
                  {fieldErrors.position && <p className="text-xs text-destructive">{fieldErrors.position}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="team">Team / Department</Label>
                  <Input id="team" name="team" placeholder="Optional" maxLength={200} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason for access</Label>
                  <Textarea
                    id="reason"
                    name="reason"
                    placeholder="Optional — describe your intended use"
                    rows={3}
                    maxLength={2000}
                  />
                </div>
                <TurnstileWidget onVerify={handleCaptchaVerify} onExpire={handleCaptchaExpire} onError={handleCaptchaExpire} />
                <div className="flex gap-3 pt-2">
                  <Button variant="outline" asChild className="flex-1">
                    <Link to="/login">
                      <ArrowLeft size={16} className="mr-2" />
                      Back
                    </Link>
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting || !captchaToken}
                    className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    {submitting ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
                    {submitting ? "Submitting…" : "Submit request"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </div>
  );
};

export default RequestAccess;
