import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link2, Loader2, CheckCircle2, Clock } from "lucide-react";
import { useFirmHasCMS } from "@/hooks/useCMSIntegration";
import { useCMSAccessRequest } from "@/hooks/useCMSAccessRequest";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface CMSRequestCardProps {
  /** Compact mode for inline use (e.g. case creation) */
  compact?: boolean;
}

/**
 * Shows a CMS connection request card if the user's firm doesn't have an active CMS integration.
 * Hidden if integration already exists.
 */
const CMSRequestCard = ({ compact = false }: CMSRequestCardProps) => {
  const { profile } = useAuth();
  const { data: hasCMS, isLoading: cmsLoading } = useFirmHasCMS();
  const { hasRequested, requestStatus, submitRequest, isLoading: reqLoading } = useCMSAccessRequest();
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Don't show if firm already has CMS or still loading
  if (cmsLoading || reqLoading || hasCMS) return null;

  const handleSubmit = async () => {
    try {
      await submitRequest.mutateAsync(message);
      toast.success("CMS integration request submitted. Your administrator will be notified.");
      setShowForm(false);
      setMessage("");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit request");
    }
  };

  // Already requested — show status
  if (hasRequested) {
    return (
      <Card className={`border-accent/20 bg-accent/5 ${compact ? "" : ""}`}>
        <CardContent className={compact ? "p-3" : "p-4"}>
          <div className="flex items-center gap-2">
            {requestStatus === "approved" ? (
              <CheckCircle2 size={16} className="text-risk-green" />
            ) : (
              <Clock size={16} className="text-muted-foreground" />
            )}
            <span className="text-sm text-foreground font-medium">
              CMS Integration Request
            </span>
            <Badge variant={requestStatus === "approved" ? "default" : "secondary"} className="text-[10px]">
              {requestStatus === "approved" ? "Approved" : requestStatus === "rejected" ? "Declined" : "Pending"}
            </Badge>
          </div>
          {requestStatus === "pending" && (
            <p className="text-xs text-muted-foreground mt-1">
              Your request to connect {profile?.firm_name || "your firm"} to a case management system is being reviewed.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Show request form or prompt
  if (compact) {
    return (
      <div className="rounded-lg border border-dashed border-accent/30 bg-accent/5 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Link2 size={14} className="text-accent" />
          <span className="text-xs font-semibold text-foreground">Connect to your Case Management System</span>
        </div>
        {!showForm ? (
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setShowForm(true)}>
            Request CMS Access
          </Button>
        ) : (
          <div className="space-y-2">
            <Input
              placeholder="Optional: your CMS provider or notes"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="h-8 text-xs"
            />
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={submitRequest.isPending}>
                {submitRequest.isPending ? <Loader2 size={12} className="animate-spin" /> : "Submit Request"}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Auto-import case data from Hoowla or other CMS platforms.
        </p>
      </div>
    );
  }

  // Full card for dashboard / settings
  return (
    <Card className="border-accent/20 bg-accent/5 hover:border-accent/40 transition-all">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-accent/10">
            <Link2 size={18} className="text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Connect Your Case Management System</h3>
            <p className="text-xs text-muted-foreground">
              Auto-import case data from Hoowla and save time on data entry
            </p>
          </div>
        </div>
        {!showForm ? (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowForm(true)}>
            <Link2 size={14} /> Request CMS Integration
          </Button>
        ) : (
          <div className="space-y-2">
            <Input
              placeholder="Optional: which CMS do you use? Any notes for the admin?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSubmit} disabled={submitRequest.isPending}>
                {submitRequest.isPending ? <Loader2 size={14} className="animate-spin" /> : "Submit Request"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CMSRequestCard;
