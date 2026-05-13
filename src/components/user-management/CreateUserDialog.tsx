import { useState, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, UserPlus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { validateName, validateProfessionalEmail, validateFirmName } from "@/lib/validation";

interface CreateUserDialogProps {
  open: boolean;
  onClose: () => void;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  firm_name: string;
  position: string;
  department: string;
  sendInvite: boolean;
}

const initial: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  role: "user",
  firm_name: "",
  position: "",
  department: "",
  sendInvite: true,
};

const CreateUserDialog = ({ open, onClose }: CreateUserDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);
  const [addAnother, setAddAnother] = useState(false);

  const set = useCallback((field: keyof FormState, value: any) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }, []);

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};

    const fnErr = validateName(form.firstName, "First name");
    if (fnErr) e.firstName = fnErr;

    const lnErr = validateName(form.lastName, "Last name");
    if (lnErr) e.lastName = lnErr;

    const emErr = validateProfessionalEmail(form.email);
    if (emErr) e.email = emErr;

    if (form.firm_name.trim()) {
      const fErr = validateFirmName(form.firm_name);
      if (fErr) e.firm_name = fErr;
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);

    try {
      const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`;
      const email = form.email.trim().toLowerCase();

      // Check for duplicate email
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .is("deleted_at", null)
        .maybeSingle();

      if (existing) {
        setErrors({ email: "A user with this email already exists." });
        setSaving(false);
        return;
      }

      // Check for existing pending invitation
      const { data: existingInvite } = await supabase
        .from("user_invitations")
        .select("id")
        .eq("email", email)
        .eq("status", "pending")
        .maybeSingle();

      if (existingInvite) {
        setErrors({ email: "A pending invitation already exists for this email." });
        setSaving(false);
        return;
      }

      // Create invitation record
      if (form.sendInvite) {
        const { error: inviteErr } = await supabase
          .from("user_invitations")
          .insert({
            email,
            role: form.role as any,
            invited_by: user?.id ?? "",
          });
        if (inviteErr) throw inviteErr;
      }

      // Log the action
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("full_name, email, position")
        .eq("user_id", user?.id ?? "")
        .single();

      await supabase.from("audit_log").insert({
        user_id: user?.id,
        user_name: adminProfile?.full_name ?? "Admin",
        user_email: adminProfile?.email ?? "",
        user_position: adminProfile?.position ?? "",
        event_type: form.sendInvite ? "user_invited" : "user_created",
        metadata: JSON.stringify({
          target_email: email,
          target_name: fullName,
          role: form.role,
          firm_name: form.firm_name.trim(),
          department: form.department.trim(),
          send_invite: form.sendInvite,
        }),
      });

      toast({
        title: form.sendInvite ? "Invitation sent" : "User created",
        description: form.sendInvite
          ? `An invitation has been sent to ${email}.`
          : `User ${fullName} has been created.`,
      });

      queryClient.invalidateQueries({ queryKey: ["admin_profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin_invitations"] });

      if (addAnother) {
        setForm(initial);
        setErrors({});
      } else {
        setForm(initial);
        setErrors({});
        onClose();
      }
    } catch (err: any) {
      toast({
        title: "Error creating user",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setForm(initial);
    setErrors({});
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus size={18} /> Create New User
          </DialogTitle>
          <DialogDescription>
            Add a new user to the platform. Optionally send them an invitation email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cu-firstName" className="text-xs">First Name *</Label>
              <Input
                id="cu-firstName"
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                placeholder="Jane"
                className={errors.firstName ? "border-destructive" : ""}
              />
              {errors.firstName && <p className="text-[11px] text-destructive">{errors.firstName}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-lastName" className="text-xs">Last Name *</Label>
              <Input
                id="cu-lastName"
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                placeholder="Smith"
                className={errors.lastName ? "border-destructive" : ""}
              />
              {errors.lastName && <p className="text-[11px] text-destructive">{errors.lastName}</p>}
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="cu-email" className="text-xs">Email Address *</Label>
            <Input
              id="cu-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="jane.smith@lawfirm.co.uk"
              className={errors.email ? "border-destructive" : ""}
            />
            {errors.email && <p className="text-[11px] text-destructive">{errors.email}</p>}
          </div>

          {/* Role + Firm */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={form.role} onValueChange={(v) => set("role", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="auditor">Auditor</SelectItem>
                  <SelectItem value="support_admin">Support Admin</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-firm" className="text-xs">Firm Name</Label>
              <Input
                id="cu-firm"
                value={form.firm_name}
                onChange={(e) => set("firm_name", e.target.value)}
                placeholder="Smith & Partners LLP"
                className={errors.firm_name ? "border-destructive" : ""}
              />
              {errors.firm_name && <p className="text-[11px] text-destructive">{errors.firm_name}</p>}
            </div>
          </div>

          {/* Position + Department */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cu-position" className="text-xs">Position</Label>
              <Input
                id="cu-position"
                value={form.position}
                onChange={(e) => set("position", e.target.value)}
                placeholder="Solicitor"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-dept" className="text-xs">Department</Label>
              <Input
                id="cu-dept"
                value={form.department}
                onChange={(e) => set("department", e.target.value)}
                placeholder="Conveyancing"
              />
            </div>
          </div>

          {/* Send Invite toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label className="text-sm font-medium">Send Invitation Email</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                The user will receive an email to set up their account.
              </p>
            </div>
            <Switch
              checked={form.sendInvite}
              onCheckedChange={(v) => set("sendInvite", v)}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setAddAnother(true); handleSubmit(); }}
            disabled={saving}
            className="gap-1"
          >
            <Plus size={14} /> Create & Add Another
          </Button>
          <Button
            onClick={() => { setAddAnother(false); handleSubmit(); }}
            disabled={saving}
            className="gap-1"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            {form.sendInvite ? "Create & Send Invite" : "Create User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateUserDialog;
