import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { roleRank } from "@/lib/roleHierarchy";
import { validateName, validateEmail, validateFirmName } from "@/lib/validation";
import type { UserStatus } from "./UserStatusBadge";

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  position: string;
  firm_name: string;
  active: boolean;
  status?: UserStatus;
  department?: string | null;
}

interface EditUserFormProps {
  open: boolean;
  onClose: () => void;
  profile: UserProfile | null;
  userRole: string;
}

interface FormState {
  full_name: string;
  email: string;
  position: string;
  firm_name: string;
  department: string;
  role: string;
}

const EditUserForm = ({ open, onClose, profile, userRole }: EditUserFormProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { role: currentUserRole } = useAuth();
  const isSuperAdmin = currentUserRole === "super_admin";
  const { user } = useAuth();

  const [form, setForm] = useState<FormState>({
    full_name: "",
    email: "",
    position: "",
    firm_name: "",
    department: "",
    role: "user",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);

  // Store original values for dirty check and diff
  const [original, setOriginal] = useState<FormState>({
    full_name: "",
    email: "",
    position: "",
    firm_name: "",
    department: "",
    role: "user",
  });

  // Populate form when profile changes
  useEffect(() => {
    if (profile && open) {
      const state: FormState = {
        full_name: profile.full_name,
        email: profile.email,
        position: profile.position || "",
        firm_name: profile.firm_name || "",
        department: (profile as any).department || "",
        role: userRole,
      };
      setForm(state);
      setOriginal(state);
      setErrors({});
    }
  }, [profile, userRole, open]);

  const isDirty = useMemo(() => {
    return Object.keys(form).some(
      (k) => form[k as keyof FormState] !== original[k as keyof FormState]
    );
  }, [form, original]);

  const set = useCallback((field: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }, []);

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};

    const nameErr = validateName(form.full_name, "Full name");
    if (nameErr) e.full_name = nameErr;

    const emailErr = validateEmail(form.email);
    if (emailErr) e.email = emailErr;

    if (form.firm_name.trim()) {
      const fErr = validateFirmName(form.firm_name);
      if (fErr) e.firm_name = fErr;
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const computeDiff = (): Record<string, { from: string; to: string }> => {
    const diff: Record<string, { from: string; to: string }> = {};
    for (const key of Object.keys(form) as (keyof FormState)[]) {
      if (form[key] !== original[key]) {
        diff[key] = { from: original[key], to: form[key] };
      }
    }
    return diff;
  };

  const handleSave = async () => {
    if (!profile || !validate()) return;
    setSaving(true);

    try {
      const diff = computeDiff();

      // Update profile
      const profileUpdates: Record<string, any> = {};
      if (diff.full_name) profileUpdates.full_name = form.full_name.trim();
      if (diff.email) profileUpdates.email = form.email.trim().toLowerCase();
      if (diff.position) profileUpdates.position = form.position.trim();
      if (diff.firm_name) profileUpdates.firm_name = form.firm_name.trim();
      if (diff.department) profileUpdates.department = form.department.trim();

      if (Object.keys(profileUpdates).length > 0) {
        const { error } = await supabase
          .from("profiles")
          .update(profileUpdates)
          .eq("id", profile.id);
        if (error) throw error;
      }

      // Update role if changed
      if (diff.role) {
        const { error } = await supabase
          .from("user_roles")
          .update({ role: form.role as any })
          .eq("user_id", profile.user_id);
        if (error) throw error;
      }

      // Audit log with before/after
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
        event_type: "user_profile_updated",
        metadata: JSON.stringify({
          target_user_id: profile.user_id,
          target_name: profile.full_name,
          changes: diff,
        }),
      });

      toast({ title: "User updated", description: "Profile changes saved successfully." });
      queryClient.invalidateQueries({ queryKey: ["admin_profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin_user_roles"] });
      onClose();
    } catch (err: any) {
      toast({
        title: "Error saving changes",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAttemptClose = () => {
    if (isDirty) {
      setShowUnsavedWarning(true);
    } else {
      onClose();
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && handleAttemptClose()}>
        <SheetContent className="w-full sm:max-w-[480px] flex flex-col">
          <SheetHeader>
            <SheetTitle>Edit User</SheetTitle>
            <SheetDescription>
              Update profile details for {profile?.full_name ?? "this user"}.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 py-4 overflow-y-auto">
            {/* Full Name */}
            <div className="space-y-1.5">
              <Label htmlFor="eu-name" className="text-xs">Full Name *</Label>
              <Input
                id="eu-name"
                value={form.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                className={errors.full_name ? "border-destructive" : ""}
              />
              {errors.full_name && <p className="text-[11px] text-destructive">{errors.full_name}</p>}
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="eu-email" className="text-xs">Email *</Label>
              <Input
                id="eu-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && <p className="text-[11px] text-destructive">{errors.email}</p>}
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) => set("role", v)}
                disabled={form.role === "super_admin" && !isSuperAdmin}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="auditor">Auditor</SelectItem>
                  <SelectItem value="support_admin">Support Admin</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  {isSuperAdmin && (
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {form.role === "super_admin" && !isSuperAdmin && (
                <p className="text-[11px] text-muted-foreground">
                  Only Super Admins can modify this role.
                </p>
              )}
            </div>

            {/* Position */}
            <div className="space-y-1.5">
              <Label htmlFor="eu-position" className="text-xs">Position</Label>
              <Input
                id="eu-position"
                value={form.position}
                onChange={(e) => set("position", e.target.value)}
              />
            </div>

            {/* Firm */}
            <div className="space-y-1.5">
              <Label htmlFor="eu-firm" className="text-xs">Firm Name</Label>
              <Input
                id="eu-firm"
                value={form.firm_name}
                onChange={(e) => set("firm_name", e.target.value)}
                className={errors.firm_name ? "border-destructive" : ""}
              />
              {errors.firm_name && <p className="text-[11px] text-destructive">{errors.firm_name}</p>}
            </div>

            {/* Department */}
            <div className="space-y-1.5">
              <Label htmlFor="eu-dept" className="text-xs">Department</Label>
              <Input
                id="eu-dept"
                value={form.department}
                onChange={(e) => set("department", e.target.value)}
              />
            </div>
          </div>

          <SheetFooter className="border-t border-border pt-4">
            <div className="flex items-center justify-between w-full">
              {isDirty && (
                <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--risk-amber))]">
                  <AlertTriangle size={12} />
                  Unsaved changes
                </div>
              )}
              {!isDirty && <div />}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleAttemptClose}>Cancel</Button>
                <Button size="sm" onClick={handleSave} disabled={saving || !isDirty} className="gap-1.5">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save Changes
                </Button>
              </div>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Unsaved changes confirmation */}
      <AlertDialog open={showUnsavedWarning} onOpenChange={setShowUnsavedWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to close without saving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowUnsavedWarning(false); onClose(); }}>
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default EditUserForm;
