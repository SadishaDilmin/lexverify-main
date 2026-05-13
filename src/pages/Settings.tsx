import { useState, useEffect, lazy, Suspense } from "react";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Pencil, Loader2 } from "lucide-react";
import { validateName, validateFirmName, validatePosition, sanitiseName, sanitisePosition } from "@/lib/validation";
import CMSRequestCard from "@/components/CMSRequestCard";

const MFAEnforcementCard = lazy(() => import("@/components/case-workspace/MFAEnforcementCard"));
const GDPRDataExportPanel = lazy(() => import("@/components/case-workspace/GDPRDataExportPanel"));
const AuditTrailExport = lazy(() => import("@/components/case-workspace/AuditTrailExport"));

const SettingsFallback = () => <div className="flex justify-center py-4"><Loader2 className="animate-spin text-muted-foreground" size={18} /></div>;

const Settings = () => {
  const { profile, user, refreshProfile } = useAuth();

  // Profile editing
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("");
  const [firmName, setFirmName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name);
      setPosition(profile.position);
      setFirmName(profile.firm_name || "");
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    const nameErr = validateName(fullName, "Full name");
    if (nameErr) {
      toast.error(nameErr);
      return;
    }
    // H8 Fix: Validate and sanitise position to prevent stored XSS
    const posErr = validatePosition(position);
    if (posErr) {
      toast.error(posErr);
      return;
    }
    const firmErr = validateFirmName(firmName);
    if (firmErr) {
      toast.error(firmErr);
      return;
    }
    const cleanPosition = sanitisePosition(position);
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim(), position: cleanPosition, firm_name: firmName.trim() })
      .eq("user_id", user!.id);
    setSavingProfile(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Profile updated successfully.");
      setEditing(false);
      // H1 fix: Refresh profile in-context instead of destroying state with reload
      await refreshProfile();
    }
  };

  // Password change
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated successfully.");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">Manage your account</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Profile</CardTitle>
                <CardDescription>Your account details</CardDescription>
              </div>
              {!editing && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
                  <Pencil size={14} /> Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {editing ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="full-name">Full Name</Label>
                    <Input
                      id="full-name"
                      value={fullName}
                      onChange={(e) => setFullName(sanitiseName(e.target.value))}
                      maxLength={200}
                    />
                  </div>
                  <div>
                    <Label htmlFor="position">Position</Label>
                    <Input
                      id="position"
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="firm-name">Firm Name (as it appears in drafts)</Label>
                    <Input
                      id="firm-name"
                      value={firmName}
                      onChange={(e) => setFirmName(e.target.value)}
                      placeholder="e.g. Jones & Partners Solicitors LLP"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-muted-foreground text-xs">Email</Label>
                    <p className="text-sm font-medium text-foreground">{profile?.email ?? user?.email ?? "—"}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveProfile} disabled={savingProfile}>
                    {savingProfile ? "Saving…" : "Save Changes"}
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setEditing(false);
                    setFullName(profile?.full_name ?? "");
                    setPosition(profile?.position ?? "");
                    setFirmName(profile?.firm_name ?? "");
                  }}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Full Name</Label>
                  <p className="text-sm font-medium text-foreground">{profile?.full_name ?? "—"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Position</Label>
                  <p className="text-sm font-medium text-foreground">{profile?.position ?? "—"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Firm Name</Label>
                  <p className="text-sm font-medium text-foreground">{profile?.firm_name || "—"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Email</Label>
                  <p className="text-sm font-medium text-foreground">{profile?.email ?? user?.email ?? "—"}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Change Password</CardTitle>
            <CardDescription>Update your login password</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>
            <Button onClick={handleChangePassword} disabled={changingPassword || !newPassword}>
              {changingPassword ? "Updating…" : "Update Password"}
            </Button>
          </CardContent>
        </Card>

        {/* CMS Integration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Case Management System</CardTitle>
            <CardDescription>Connect to your firm's CMS to auto-import case data</CardDescription>
          </CardHeader>
          <CardContent>
            <CMSRequestCard />
          </CardContent>
        </Card>

        {/* MFA */}
        <Suspense fallback={<SettingsFallback />}>
          <MFAEnforcementCard />
        </Suspense>

        {/* GDPR Data Export */}
        <Suspense fallback={<SettingsFallback />}>
          <GDPRDataExportPanel />
        </Suspense>

        {/* Audit Trail Export */}
        <Suspense fallback={<SettingsFallback />}>
          <AuditTrailExport />
        </Suspense>

      </div>
    </AppLayout>
  );
};

export default Settings;
