import { useState } from "react";
import { UserPlus, Send, Gift, Loader2, CheckCircle2, Clock, UserCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { validateName, validateEmail, validateFirmName, validatePhone, sanitiseName, sanitisePhone } from "@/lib/validation";

const MAX_REFERRALS = 10;

interface ReferralWidgetProps {
  /** When true, renders as a trigger button + dialog instead of an inline card */
  asDialog?: boolean;
}

export default function ReferralWidget({ asDialog = false }: ReferralWidgetProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [firmName, setFirmName] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [alreadyMember, setAlreadyMember] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: referrals = [] } = useQuery({
    queryKey: ["referrals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrals" as any)
        .select("*")
        .eq("referrer_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  const remaining = MAX_REFERRALS - referrals.length;

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const clearError = (field: string) => {
    if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate
    const errors: Record<string, string> = {};
    const nameErr = validateName(fullName, "Full name");
    if (nameErr) errors.fullName = nameErr;
    const emailErr = validateEmail(email, "Email");
    if (emailErr) errors.email = emailErr;
    const firmErr = validateFirmName(firmName);
    if (firmErr) errors.firmName = firmErr;
    const phoneErr = validatePhone(phone);
    if (phoneErr) errors.phone = phoneErr;
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setSending(true);

    try {
      const { data, error } = await supabase.functions.invoke("send-referral-invite", {
        body: { fullName: fullName.trim(), email: email.trim(), firmName: firmName.trim(), phone: phone.trim() },
      });

      if (error) throw error;
      if (data?.error === "already_member") {
        setAlreadyMember(data.firstName || fullName.split(" ")[0]);
        return;
      }
      if (data?.error) {
        toast({ title: "Cannot send invite", description: data.error, variant: "destructive" });
        return;
      }

      toast({
        title: "Invitation sent! 🎉",
        description: data?.emailSent
          ? `We've emailed ${fullName.split(" ")[0]}. You'll both receive £25 when they register.`
          : `Referral recorded for ${fullName.split(" ")[0]}. You'll both receive £25 when they register.`,
      });

      setFullName("");
      setEmail("");
      setFirmName("");
      setPhone("");
      queryClient.invalidateQueries({ queryKey: ["referrals"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Something went wrong", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const formContent = (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Invite a colleague to Olimey AI. When they register, you both receive <strong>£25 worth of credits</strong>.
      </p>

      {remaining > 0 ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Full Name *</Label>
              <Input
                value={fullName}
                onChange={(e) => { setFullName(sanitiseName(e.target.value)); clearError("fullName"); }}
                placeholder="Jane Smith"
                className={`h-8 text-sm ${formErrors.fullName ? "border-destructive" : ""}`}
                required
                maxLength={200}
              />
              {formErrors.fullName && <p className="text-[10px] text-destructive">{formErrors.fullName}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email Address *</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
                placeholder="jane@example.com"
                className={`h-8 text-sm ${formErrors.email ? "border-destructive" : ""}`}
                required
                maxLength={255}
              />
              {formErrors.email && <p className="text-[10px] text-destructive">{formErrors.email}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Firm Name *</Label>
              <Input
                value={firmName}
                onChange={(e) => { setFirmName(e.target.value); clearError("firmName"); }}
                placeholder="Smith & Co Solicitors"
                className={`h-8 text-sm ${formErrors.firmName ? "border-destructive" : ""}`}
                required
                maxLength={200}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(sanitisePhone(e.target.value)); clearError("phone"); }}
                placeholder="07700 900000"
                className={`h-8 text-sm ${formErrors.phone ? "border-destructive" : ""}`}
                maxLength={20}
              />
              {formErrors.phone && <p className="text-[10px] text-destructive">{formErrors.phone}</p>}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {remaining} invite{remaining !== 1 ? "s" : ""} remaining
            </span>
            <Button type="submit" size="sm" disabled={sending || !fullName.trim() || !email.trim() || !firmName.trim()} className="gap-1.5">
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send Invite
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">
          You've used all {MAX_REFERRALS} invitations. Thank you for spreading the word!
        </p>
      )}

      {/* Referral history */}
      {referrals.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-border">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Your Referrals</p>
          <div className="space-y-1">
            {referrals.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/30 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <UserPlus size={12} className="text-muted-foreground shrink-0" />
                  <span className="text-foreground truncate">{r.referee_full_name}</span>
                  <span className="text-muted-foreground truncate hidden sm:inline">{r.referee_email}</span>
                </div>
                {r.status === "registered" ? (
                  <Badge variant="outline" className="text-[10px] gap-1 text-risk-green border-risk-green/30 shrink-0">
                    <CheckCircle2 size={10} /> Joined
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] gap-1 shrink-0">
                    <Clock size={10} /> Pending
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const alreadyMemberDialog = (
    <Dialog open={!!alreadyMember} onOpenChange={() => setAlreadyMember(null)}>
      <DialogContent className="max-w-sm text-center space-y-3">
        <div className="mx-auto w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
          <UserCheck size={24} className="text-accent" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">Thanks for thinking of them!</h3>
        <p className="text-sm text-muted-foreground">
          <strong>{alreadyMember}</strong> is already a member of Olimey AI, so there's no need to send an invite.
        </p>
        <Button variant="outline" size="sm" onClick={() => setAlreadyMember(null)} className="mx-auto">
          Got it
        </Button>
      </DialogContent>
    </Dialog>
  );

  if (asDialog) {
    return (
      <>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-accent/30 text-accent hover:bg-accent/10 hover:text-accent rounded-full"
            >
              <Gift size={14} />
              <span className="hidden sm:inline">Invite a Friend</span>
              <span className="sm:hidden">Invite</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Gift size={16} className="text-accent" />
                Invite a Friend — Earn £25 Each
              </DialogTitle>
            </DialogHeader>
            {formContent}
          </DialogContent>
        </Dialog>
        {alreadyMemberDialog}
      </>
    );
  }

  // Inline card mode (legacy)
  return (
    <>
      <Card className="border-border overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gift size={16} className="text-accent" />
            Invite a Friend — Earn £25 Each
          </CardTitle>
        </CardHeader>
        <CardContent>{formContent}</CardContent>
      </Card>
      {alreadyMemberDialog}
    </>
  );
}
