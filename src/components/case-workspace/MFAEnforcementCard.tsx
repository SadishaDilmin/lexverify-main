import { useState, useEffect } from "react";
import { Shield, ShieldCheck, Loader2, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function MFAEnforcementCard() {
  const { toast } = useToast();
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    checkMFA();
  }, []);

  const checkMFA = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    const totpFactors = (data?.totp || []).filter((f: any) => f.status === "verified");
    setMfaEnabled(totpFactors.length > 0);
  };

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Olimey AI Authenticator",
      });
      if (error) throw error;
      setQrUri(data.totp.uri);
      setFactorId(data.id);
    } catch (e: any) {
      toast({ title: "MFA setup failed", description: e.message, variant: "destructive" });
    } finally {
      setEnrolling(false);
    }
  };

  const handleVerify = async () => {
    if (!factorId || !verifyCode) return;
    setVerifying(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;

      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: verifyCode,
      });
      if (verify.error) throw verify.error;

      setMfaEnabled(true);
      setQrUri(null);
      setFactorId(null);
      setVerifyCode("");
      toast({ title: "MFA enabled", description: "Two-factor authentication is now active on your account." });
    } catch (e: any) {
      toast({ title: "Verification failed", description: e.message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  if (mfaEnabled === null) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield size={16} className="text-accent" />
          Two-Factor Authentication
          {mfaEnabled ? (
            <Badge className="text-[9px] h-4 bg-[hsl(var(--risk-green))]/10 text-[hsl(var(--risk-green))] border-[hsl(var(--risk-green))]/20">
              <ShieldCheck size={10} className="mr-0.5" /> Active
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[9px] h-4 text-destructive">Not enabled</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {mfaEnabled ? (
          <p className="text-xs text-muted-foreground">
            Your account is protected with TOTP-based two-factor authentication. You'll need your authenticator app each time you sign in.
          </p>
        ) : qrUri ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code below.
            </p>
            <div className="flex justify-center p-4 bg-white rounded-lg">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUri)}`}
                alt="MFA QR Code"
                className="w-40 h-40"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit code"
                className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                maxLength={6}
              />
              <Button
                size="sm"
                onClick={handleVerify}
                disabled={verifyCode.length !== 6 || verifying}
              >
                {verifying ? <Loader2 size={14} className="animate-spin" /> : "Verify"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Protect your account with TOTP-based two-factor authentication. Recommended for all users handling sensitive case data.
            </p>
            <Button
              size="sm"
              className="w-full gap-1.5"
              onClick={handleEnroll}
              disabled={enrolling}
            >
              {enrolling ? <Loader2 size={14} className="animate-spin" /> : <Smartphone size={14} />}
              Set Up MFA
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
