import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, AlertTriangle, Clock, FileText, Home, MapPin } from "lucide-react";

interface PortalData {
  client_name: string;
  case_reference: string;
  property_address: string;
  transaction_type: string;
  tenure: string;
  property_type: string;
  purchase_price: number | null;
  lender: string | null;
  status: string;
  case_id: string;
}

type PortalState =
  | { kind: "loading" }
  | { kind: "valid"; data: PortalData }
  | { kind: "expired" }
  | { kind: "invalid" }
  | { kind: "error"; message: string };

export default function ClientPortal() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PortalState>({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid" });
      return;
    }

    async function resolve() {
      try {
        // Look up the token
        const { data: tokenRow, error: tokenErr } = await supabase
          .from("client_portal_tokens")
          .select("*")
          .eq("token", token!)
          .maybeSingle();

        if (tokenErr) {
          console.error("[ClientPortal] Token lookup error:", tokenErr);
          setState({ kind: "error", message: "Unable to verify link. Please try again." });
          return;
        }

        if (!tokenRow) {
          console.warn("[ClientPortal] No token found for:", token);
          setState({ kind: "invalid" });
          return;
        }

        // Check expiry
        if (new Date(tokenRow.expires_at) < new Date()) {
          console.info("[ClientPortal] Token expired:", tokenRow.id);
          setState({ kind: "expired" });
          return;
        }

        // Check active
        if (!tokenRow.is_active) {
          console.info("[ClientPortal] Token deactivated:", tokenRow.id);
          setState({ kind: "invalid" });
          return;
        }

        // Fetch case details
        const { data: caseRow, error: caseErr } = await supabase
          .from("cases")
          .select("case_reference, property_address, transaction_type, tenure, property_type, purchase_price, lender, status")
          .eq("id", tokenRow.case_id)
          .maybeSingle();

        if (caseErr || !caseRow) {
          console.error("[ClientPortal] Case lookup error:", caseErr);
          setState({ kind: "error", message: "Unable to load case details." });
          return;
        }

        // Update last_accessed_at (fire-and-forget)
        supabase
          .from("client_portal_tokens")
          .update({ last_accessed_at: new Date().toISOString() })
          .eq("id", tokenRow.id)
          .then(() => {});

        setState({
          kind: "valid",
          data: {
            client_name: tokenRow.client_name,
            case_reference: caseRow.case_reference,
            property_address: caseRow.property_address,
            transaction_type: caseRow.transaction_type,
            tenure: caseRow.tenure,
            property_type: caseRow.property_type,
            purchase_price: caseRow.purchase_price,
            lender: caseRow.lender,
            status: caseRow.status,
            case_id: tokenRow.case_id,
          },
        });
      } catch (err: any) {
        console.error("[ClientPortal] Unexpected error:", err);
        setState({ kind: "error", message: err.message || "Something went wrong." });
      }
    }

    resolve();
  }, [token]);

  if (state.kind === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-accent mx-auto" />
          <p className="text-sm text-muted-foreground">Verifying your portal link…</p>
        </div>
      </div>
    );
  }

  if (state.kind === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 text-center space-y-4">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto" />
            <h1 className="text-xl font-semibold text-foreground">Link Expired</h1>
            <p className="text-sm text-muted-foreground">
              This client portal link has expired. Please contact your conveyancer to request a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.kind === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-xl font-semibold text-foreground">Invalid Link</h1>
            <p className="text-sm text-muted-foreground">
              This portal link is invalid or has been deactivated. Please contact your conveyancer for assistance.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto" />
            <h1 className="text-xl font-semibold text-foreground">Something Went Wrong</h1>
            <p className="text-sm text-muted-foreground">{state.message}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data } = state;
  const fmt = (v: number | null) => v != null ? `£${v.toLocaleString("en-GB")}` : "—";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-accent" />
            <span className="font-semibold text-foreground text-sm">Olimey AI Client Portal</span>
          </div>
          <Badge variant="secondary" className="text-[10px]">Read-only</Badge>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Welcome,</p>
          <h1 className="text-2xl font-bold text-foreground">{data.client_name}</h1>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText size={14} className="text-accent" />
              Case Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">Case Reference</dt>
                <dd className="font-medium text-foreground">{data.case_reference}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Status</dt>
                <dd>
                  <Badge variant="outline" className="text-[10px] capitalize">{data.status}</Badge>
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground text-xs flex items-center gap-1">
                  <MapPin size={10} /> Property Address
                </dt>
                <dd className="font-medium text-foreground">{data.property_address}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Transaction Type</dt>
                <dd className="font-medium text-foreground">{data.transaction_type}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Property Type</dt>
                <dd className="font-medium text-foreground">{data.property_type}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Tenure</dt>
                <dd className="font-medium text-foreground">{data.tenure}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Purchase Price</dt>
                <dd className="font-medium text-foreground">{fmt(data.purchase_price)}</dd>
              </div>
              {data.lender && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground text-xs">Lender</dt>
                  <dd className="font-medium text-foreground">{data.lender}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          This is a read-only view provided by your conveyancer. For questions, please contact your solicitor directly.
        </p>
      </main>
    </div>
  );
}
