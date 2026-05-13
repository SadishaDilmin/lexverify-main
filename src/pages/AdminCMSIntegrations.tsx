import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Link2, Loader2, ShieldCheck, CheckCircle2, XCircle, MessageSquare } from "lucide-react";

interface CMSIntegration {
  id: string;
  provider: string;
  firm_name: string;
  api_base_url: string;
  provider_user_email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const PROVIDERS = [
  { value: "hoowla", label: "Hoowla", description: "Hoowla case management system" },
];

async function cmsAction(action: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("manage-cms-integration", {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message || "Request failed");
  if (data?.error) throw new Error(data.error);
  return data;
}

const AdminCMSIntegrations = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CMSIntegration | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [provider, setProvider] = useState("hoowla");
  const [firmName, setFirmName] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("https://app.hoowla.com");
  const [apiKey, setApiKey] = useState("");
  const [providerUserEmail, setProviderUserEmail] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Fetch integrations — api_key_encrypted column is revoked so we exclude it
  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["cms_integrations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cms_integrations")
        .select("id, provider, firm_name, api_base_url, provider_user_email, is_active, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as CMSIntegration[]) ?? [];
    },
  });

  // Fetch user access requests
  const { data: accessRequests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ["cms_access_requests_admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cms_access_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateRequestStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("cms_access_requests")
        .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: user!.id })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms_access_requests_admin"] });
      toast.success("Request updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!firmName.trim() || !apiBaseUrl.trim() || !providerUserEmail.trim() || (!editing && !apiKey.trim())) {
        throw new Error("Please fill in all required fields");
      }

      if (editing) {
        await cmsAction("update", {
          id: editing.id,
          firm_name: firmName.trim(),
          api_base_url: apiBaseUrl.trim(),
          api_key: apiKey.trim() || undefined,
          provider_user_email: providerUserEmail.trim(),
          is_active: isActive,
        });
      } else {
        await cmsAction("create", {
          provider,
          firm_name: firmName.trim(),
          api_base_url: apiBaseUrl.trim(),
          api_key: apiKey.trim(),
          provider_user_email: providerUserEmail.trim(),
          is_active: isActive,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms_integrations"] });
      toast.success(editing ? "Integration updated" : "Integration created");
      closeDialog();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await cmsAction("delete", { id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms_integrations"] });
      toast.success("Integration deleted");
      setDeleteConfirm(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await cmsAction("toggle", { id, is_active: active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms_integrations"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openCreate = () => {
    setEditing(null);
    setProvider("hoowla");
    setFirmName("");
    setApiBaseUrl("https://app.hoowla.com");
    setApiKey("");
    setProviderUserEmail("");
    setIsActive(true);
    setDialogOpen(true);
  };

  const openEdit = (integration: CMSIntegration) => {
    setEditing(integration);
    setProvider(integration.provider);
    setFirmName(integration.firm_name);
    setApiBaseUrl(integration.api_base_url);
    setApiKey("");
    setProviderUserEmail(integration.provider_user_email || "");
    setIsActive(integration.is_active);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">CMS Integrations</h1>
            <p className="text-muted-foreground">
              Connect firm accounts to case management systems for automatic data import
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus size={16} /> Add Integration
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-muted-foreground" size={24} />
          </div>
        ) : integrations.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Link2 size={40} className="mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">No CMS integrations configured yet.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add an integration to allow firms to auto-import case data from their CMS.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {integrations.map((integration) => (
              <Card key={integration.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                        <ShieldCheck size={20} className="text-accent" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {PROVIDERS.find((p) => p.value === integration.provider)?.label ?? integration.provider}
                          </span>
                          <Badge variant={integration.is_active ? "default" : "secondary"} className="text-[10px]">
                            {integration.is_active ? "Active" : "Disabled"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{integration.firm_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{integration.api_base_url}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={integration.is_active}
                        onCheckedChange={(active) =>
                          toggleActiveMutation.mutate({ id: integration.id, active })
                        }
                      />
                      <Button variant="ghost" size="sm" onClick={() => openEdit(integration)}>
                        <Pencil size={14} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(integration.id)}>
                        <Trash2 size={14} className="text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Access Requests Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Access Requests</h2>
              <p className="text-sm text-muted-foreground">User requests to connect their firm to a CMS</p>
            </div>
            {accessRequests.filter((r) => r.status === "pending").length > 0 && (
              <Badge variant="default" className="text-xs">
                {accessRequests.filter((r) => r.status === "pending").length} pending
              </Badge>
            )}
          </div>

          {requestsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-muted-foreground" size={20} />
            </div>
          ) : accessRequests.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <MessageSquare size={32} className="mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No access requests yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {accessRequests.map((req) => (
                <Card key={req.id} className={req.status === "pending" ? "border-accent/30" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">{req.user_name}</span>
                          <Badge
                            variant={req.status === "approved" ? "default" : req.status === "rejected" ? "destructive" : "secondary"}
                            className="text-[10px]"
                          >
                            {req.status === "approved" ? "Approved" : req.status === "rejected" ? "Declined" : "Pending"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{req.user_email}</p>
                        <p className="text-xs text-muted-foreground">Firm: <span className="font-medium text-foreground">{req.firm_name || "—"}</span></p>
                        {req.message && (
                          <p className="text-xs text-muted-foreground italic mt-1">"{req.message}"</p>
                        )}
                        <p className="text-[11px] text-muted-foreground/60">
                          {new Date(req.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      {req.status === "pending" && (
                        <div className="flex gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 text-risk-green border-risk-green/30 hover:bg-risk-green/10"
                            onClick={() => updateRequestStatus.mutate({ id: req.id, status: "approved" })}
                            disabled={updateRequestStatus.isPending}
                          >
                            <CheckCircle2 size={12} /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => updateRequestStatus.mutate({ id: req.id, status: "rejected" })}
                            disabled={updateRequestStatus.isPending}
                          >
                            <XCircle size={12} /> Decline
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Integration" : "Add CMS Integration"}</DialogTitle>
              <DialogDescription>
                {editing
                  ? "Update the integration settings. Leave API key blank to keep the existing one."
                  : "Configure a connection to a firm's case management system."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Input value="Hoowla" disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>Firm Name *</Label>
                <Input
                  placeholder="e.g. Jones & Partners Solicitors LLP"
                  value={firmName}
                  onChange={(e) => setFirmName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Must match the firm name in user profiles exactly
                </p>
              </div>
              <div className="space-y-2">
                <Label>Server URL *</Label>
                <Input
                  placeholder="https://app.hoowla.com"
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Use <code>https://app.hoowla.com</code> for production or <code>https://hoowladev.herokuapp.com</code> for testing
                </p>
              </div>
              <div className="space-y-2">
                <Label>Hoowla User Email *</Label>
                <Input
                  type="email"
                  placeholder="user@firm.com"
                  value={providerUserEmail}
                  onChange={(e) => setProviderUserEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The email of the Hoowla user whose API key is being used
                </p>
              </div>
              <div className="space-y-2">
                <Label>API Key {editing ? "(leave blank to keep existing)" : "*"}</Label>
                <Input
                  type="password"
                  placeholder={editing ? "••••••••" : "Enter API key from Hoowla profile"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Generated from the user's profile area in Hoowla
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <Label>Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : editing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Integration</DialogTitle>
              <DialogDescription>
                This will permanently remove the CMS integration. Users from this firm will no longer be able to auto-import case data.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default AdminCMSIntegrations;
