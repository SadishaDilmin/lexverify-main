import { Link } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { motion } from "framer-motion";
import { lazy, Suspense, memo } from "react";
const AIConfidenceCalibrationPanel = lazy(() => import("@/components/case-workspace/AIConfidenceCalibrationPanel"));
const FirmAnalyticsDashboard = lazy(() => import("@/components/case-workspace/FirmAnalyticsDashboard"));
import {
  Search,
  FolderPlus,
  Loader2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  XCircle,
  X,
  FileSearch,
  ShoppingCart,
  Coins,
  ChevronDown,
  Archive,
  Trash2,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import AppLayout from "@/components/AppLayout";
import RiskBadge from "@/components/RiskBadge";
import StatusBadge from "@/components/StatusBadge";
import RingChart from "@/components/RingChart";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCredits } from "@/hooks/useCredits";
import { useCaseRealtimeToasts } from "@/hooks/useCaseRealtimeToasts";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { CaseStatus, RiskLevel } from "@/types";
import { prefetchRoute } from "@/lib/prefetchRoute";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Lazy-loaded heavy dashboard components
const CMSRequestCard = lazy(() => import("@/components/CMSRequestCard"));
const AICaseSearch = lazy(() => import("@/components/AICaseSearch"));
const OnboardingWizard = lazy(() => import("@/components/OnboardingWizard"));



const SectionHeader = memo(({
  sectionKey,
  icon: Icon,
  title,
  count,
  iconColor = "text-accent",
  isOpen,
  onToggle,
}: {
  sectionKey: string;
  icon: typeof Clock;
  title: string;
  count?: number;
  iconColor?: string;
  isOpen: boolean;
  onToggle: (key: string) => void;
}) => (
  <CollapsibleTrigger asChild>
    <button
      onClick={() => onToggle(sectionKey)}
      className="flex items-center justify-between w-full px-5 py-3.5 rounded-t-xl bg-muted/40 hover:bg-muted/60 transition-colors group"
    >
      <div className="flex items-center gap-2.5">
        <Icon size={17} className={iconColor} />
        <span className="text-sm font-semibold text-foreground tracking-tight" style={{ fontFamily: "'DM Sans', sans-serif" }}>{title}</span>
        {count !== undefined && count > 0 && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent">
            {count}
          </span>
        )}
      </div>
      <ChevronDown
        size={16}
        className={`text-muted-foreground transition-transform duration-200 ${
          isOpen ? "rotate-180" : ""
        }`}
      />
    </button>
  </CollapsibleTrigger>
));
SectionHeader.displayName = "SectionHeader";

const Dashboard = () => {
  const { user, profile, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const greetedRef = useRef(false);
  const [caseSearch, setCaseSearch] = useState("");
  const SECTION_PREFS_KEY = "ls-dashboard-sections";
  const defaultSections: Record<string, boolean> = {
    myCases: true,
    archivedCases: false,
  };

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(SECTION_PREFS_KEY);
      if (stored) return { ...defaultSections, ...JSON.parse(stored) };
    } catch {}
    return defaultSections;
  });

  const toggleSection = (key: string) =>
    setOpenSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(SECTION_PREFS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });

  const allExpanded = Object.values(openSections).every(Boolean);
  const toggleAll = () => {
    const target = !allExpanded;
    const next = Object.fromEntries(Object.keys(openSections).map((k) => [k, target]));
    setOpenSections(next);
    try { localStorage.setItem(SECTION_PREFS_KEY, JSON.stringify(next)); } catch {}
  };
  const handleDeleteCase = useCallback(async (caseId: string, caseReference: string) => {
    if (!user || !profile) return;
    try {
      // Log deletion to audit before deleting
      await supabase.from("audit_log" as any).insert({
        case_reference: caseReference,
        user_id: user.id,
        user_name: profile.full_name,
        user_email: profile.email,
        user_position: profile.position || "",
        event_type: "case_deleted",
        metadata: { case_id: caseId },
      });

      const { error } = await supabase.from("cases").delete().eq("id", caseId);
      if (error) throw error;

      toast({ title: "Case deleted", description: `${caseReference} has been permanently deleted.` });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message || "Unknown error", variant: "destructive" });
    }
  }, [user, profile, toast, queryClient]);

  // Greet the user once on mount
  useEffect(() => {
    if (greetedRef.current || !user || !profile) return;
    greetedRef.current = true;

    const firstName = profile.full_name?.split(" ")[0] || "there";
    const isAdmin = role === "admin";

    // Check if the user has logged in before by looking at audit_log entries
    const greetingPromise = supabase
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("event_type", "ai_disclaimer_accepted");

    // For admins, also fetch pending trials and new feedback counts
    const adminStatsPromise = isAdmin
      ? Promise.all([
          supabase
            .from("free_trial_requests")
            .select("*", { count: "exact", head: true })
            .eq("status", "pending"),
          supabase
            .from("agent_feedback")
            .select("*", { count: "exact", head: true }),
        ])
      : Promise.resolve(null);

    Promise.all([greetingPromise, adminStatsPromise]).then(
      ([{ count }, adminStats]) => {
        const isReturning = (count ?? 0) > 1;

        if (isAdmin) {
          const pendingTrials = adminStats?.[0]?.count ?? 0;
          const totalFeedback = adminStats?.[1]?.count ?? 0;

          const statParts: string[] = [];
          if (pendingTrials > 0) statParts.push(`${pendingTrials} pending trial${pendingTrials !== 1 ? "s" : ""}`);
          if (totalFeedback > 0) statParts.push(`${totalFeedback} feedback item${totalFeedback !== 1 ? "s" : ""}`);

          toast({
            title: isReturning
              ? `Welcome back, ${firstName} 🛡️`
              : `Welcome, ${firstName} 🛡️`,
            description: statParts.length > 0
              ? `Admin dashboard ready — ${statParts.join(", ")}.`
              : "Admin dashboard ready — all clear.",
            className: "border-accent/40 bg-accent/5",
          });
        } else {
          toast({
            title: isReturning ? `Welcome back, ${firstName}!` : `Welcome, ${firstName}!`,
            description: isReturning
              ? "Good to see you again."
              : "Let's get started with your first case.",
          });
        }
      }
    );
  }, [user, profile, role, toast]);
  const { data: credits } = useCredits();
  useCaseRealtimeToasts();

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ["cases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const completedCases = useMemo(() => cases.filter((c) => c.status === "completed"), [cases]);
  const activeCases = useMemo(() => cases.filter((c) => c.status !== "closed" && c.status !== "completed").length, [cases]);
  const reviewsComplete = useMemo(() => cases.filter((c) => c.status === "review_complete").length, [cases]);
  const amberRedFlags = useMemo(() => cases.filter((c) => c.risk_level === "amber" || c.risk_level === "red").length, [cases]);
  const totalCases = cases.length || 1; // avoid /0

  const filteredCases = useMemo(() => {
    const q = caseSearch.toLowerCase();
    return cases.filter(
      (c) =>
        c.status !== "completed" &&
        (c.case_reference.toLowerCase().includes(q) ||
        c.property_address.toLowerCase().includes(q))
    );
  }, [cases, caseSearch]);

  const filteredArchivedCases = useMemo(() => {
    const q = caseSearch.toLowerCase();
    return completedCases.filter(
      (c) =>
        c.case_reference.toLowerCase().includes(q) ||
        c.property_address.toLowerCase().includes(q)
    );
  }, [completedCases, caseSearch]);

  return (
    <AppLayout>
      <Suspense fallback={null}><OnboardingWizard /></Suspense>
      <div className="space-y-6">
        {/* Loading skeleton */}
        {isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1,2,3,4].map((i) => (
              <div key={i} className="rounded-xl border border-border/40 bg-card p-5 space-y-3">
                <div className="skeleton-pulse h-4 w-2/5 rounded" />
                <div className="skeleton-pulse h-8 w-3/5 rounded" />
                <div className="skeleton-pulse h-3 w-4/5 rounded" />
              </div>
            ))}
          </div>
        )}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3"
        >
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {cases.length === 0
                ? "Create your first case to get started"
                : `${cases.filter((c) => c.status !== "closed" && c.status !== "completed").length} active case${cases.filter((c) => c.status !== "closed" && c.status !== "completed").length !== 1 ? "s" : ""}${completedCases.length > 0 ? ` · ${completedCases.length} archived` : ""}`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleAll}
            className="self-start sm:self-auto text-xs gap-1.5 rounded-full"
          >
            <ChevronDown size={14} className={`transition-transform ${allExpanded ? "rotate-180" : ""}`} />
            {allExpanded ? "Collapse All" : "Expand All"}
          </Button>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="grid grid-cols-2 sm:grid-cols-3 gap-3"
        >
          {[
            { to: "/case/new", icon: FolderPlus, label: "New Case", desc: "Start a new matter" },
            { to: "/buy-credits", icon: ShoppingCart, label: "Buy Credits", desc: "Top up your balance" },
          ].map((action) => (
            <Link key={action.to} to={action.to}>
              <Card className="border-border/60 hover:border-accent/50 hover:shadow-md transition-all duration-200 cursor-pointer group bg-card">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent/10 group-hover:bg-accent/20 transition-colors">
                    <action.icon size={18} className="text-accent" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-foreground block">{action.label}</span>
                    <span className="text-[11px] text-muted-foreground hidden sm:block">{action.desc}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </motion.div>

        {/* CMS Integration prompt */}
        <Suspense fallback={null}><CMSRequestCard /></Suspense>

        {/* Stats row — colour-coded cards + ring charts */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          {/* Active Cases — ring chart */}
          <Card className="border-accent/30 bg-accent/5 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-200">
            <CardContent className="p-4">
              <RingChart
                value={activeCases}
                max={totalCases}
                size={52}
                color="hsl(var(--accent))"
                label={`${activeCases}`}
                sublabel="Active Cases"
              />
            </CardContent>
          </Card>

          {/* Reviews Complete — colour-coded */}
          <Card className="border-risk-green/30 bg-risk-green/5 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-200">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-risk-green/15 text-risk-green">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground leading-tight">{reviewsComplete}</div>
                <div className="text-[11px] text-muted-foreground font-medium">Reviews Complete</div>
              </div>
            </CardContent>
          </Card>

          {/* Amber / Red Flags — ring chart */}
          <Card className={`shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-200 ${amberRedFlags > 0 ? "border-risk-amber/30 bg-risk-amber/5" : "border-border/60 bg-card"}`}>
            <CardContent className="p-4">
              <RingChart
                value={amberRedFlags}
                max={Math.max(totalCases, 1)}
                size={52}
                color={amberRedFlags > 0 ? "hsl(35, 90%, 50%)" : "hsl(145, 60%, 45%)"}
                label={`${amberRedFlags}`}
                sublabel="Amber / Red Flags"
              />
            </CardContent>
          </Card>

          {/* Credits — ring chart */}
          {credits && (
            <Link to="/buy-credits">
              <Card className="border-accent/30 bg-accent/5 hover:border-accent/50 transition-all cursor-pointer shadow-sm hover:shadow-md h-full">
                <CardContent className="p-4">
                  <RingChart
                    value={credits.balance}
                    max={Math.max(credits.balance, 100)}
                    size={52}
                    color="hsl(var(--accent))"
                    label={`${credits.balance}`}
                    sublabel={`Credits${credits.is_free_trial ? " (Trial)" : ""}`}
                  />
                </CardContent>
              </Card>
            </Link>
          )}
        </motion.div>



        {/* ── AI-Powered Case Search ─────────────────────── */}
        <Suspense fallback={null}><AICaseSearch /></Suspense>

        {/* ── My Cases (collapsible) ─────────────────────────── */}
        <Collapsible open={openSections.myCases}>
          <Card className="border-border/60 overflow-hidden shadow-sm">
            <SectionHeader sectionKey="myCases" icon={Clock} title="My Cases" count={activeCases} isOpen={openSections.myCases} onToggle={toggleSection} />
            {/* Progress bar */}
            <div className="px-5 pt-2">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, hsl(var(--accent)), hsl(var(--warm)))' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${totalCases > 0 ? (reviewsComplete / totalCases) * 100 : 0}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 text-right">
                {reviewsComplete} / {cases.length} reviewed
              </p>
            </div>
            <CollapsibleContent>
              <div className="px-5 pb-2 pt-3">
                <div className="relative w-full sm:w-72 mb-3">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search cases…" className="pl-8 h-9 text-sm rounded-lg" value={caseSearch} onChange={(e) => setCaseSearch(e.target.value)} />
                </div>
              </div>
              <div className="overflow-x-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="animate-spin text-muted-foreground" size={22} />
                  </div>
                ) : filteredCases.length === 0 ? (
                  <div className="text-center py-10 space-y-3 px-4">
                    <p className="text-muted-foreground text-sm">
                      {cases.length === 0 ? "No cases yet." : "No cases match your search."}
                    </p>
                    {cases.length === 0 && (
                      <Button asChild size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 gap-1.5 rounded-lg">
                        <Link to="/case/new"><FolderPlus size={14} /> Create First Case</Link>
                      </Button>
                    )}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-accent/20 bg-muted/40">
                        <th className="text-left px-5 py-3 font-semibold text-foreground text-xs tracking-wide uppercase">Case Ref</th>
                        <th className="text-left px-5 py-3 font-semibold text-foreground text-xs tracking-wide uppercase">Property</th>
                        <th className="text-left px-5 py-3 font-semibold text-foreground text-xs tracking-wide uppercase hidden md:table-cell">Conveyancer</th>
                        <th className="text-left px-5 py-3 font-semibold text-foreground text-xs tracking-wide uppercase">Status</th>
                        <th className="text-left px-5 py-3 font-semibold text-foreground text-xs tracking-wide uppercase">Risk</th>
                        <th className="text-left px-5 py-3 font-semibold text-foreground text-xs tracking-wide uppercase hidden lg:table-cell">Updated</th>
                        <th className="px-3 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCases.map((c) => (
                        <tr key={c.id} className="border-b border-border/40 table-row-hover cursor-pointer"
                            onMouseEnter={() => prefetchRoute(() => import("@/pages/CaseWorkspace"))}>
                          <td className="px-5 py-3">
                            <Link to={`/agent/source-of-wealth?caseId=${c.id}`} className="font-mono text-accent hover:underline font-bold text-xs">
                              {c.case_reference}
                            </Link>
                          </td>
                          <td className="px-5 py-3 text-foreground max-w-xs truncate text-xs">{c.property_address}</td>
                          <td className="px-5 py-3 text-muted-foreground hidden md:table-cell text-xs">{c.conveyancer_name}</td>
                          <td className="px-5 py-3"><StatusBadge status={c.status as CaseStatus} /></td>
                          <td className="px-5 py-3">
                            {c.risk_level ? (
                              <RiskBadge level={c.risk_level as RiskLevel} score={c.risk_score ?? undefined} size="sm" />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                            {new Date(c.updated_at).toLocaleDateString("en-GB")}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-0.5">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Link
                                    to={`/case/new?duplicate=${c.id}`}
                                    className="p-1.5 rounded hover:bg-accent/10 text-muted-foreground hover:text-accent transition-colors"
                                    title="Duplicate case"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Copy size={14} />
                                  </Link>
                                </TooltipTrigger>
                                <TooltipContent>Duplicate case</TooltipContent>
                              </Tooltip>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <button
                                    className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                    title="Delete case"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete case?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete <strong>{c.case_reference}</strong> and all associated documents, reports, and data. Audit logs will be preserved for compliance. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={() => handleDeleteCase(c.id, c.case_reference)}
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </td>
                        </tr>
                      ))}

                    </tbody>
                  </table>
                )}
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* ── Archived Cases (collapsible) ─────────────────────── */}
        {completedCases.length > 0 && (
          <Collapsible open={openSections.archivedCases}>
            <Card className="border-border/60 overflow-hidden shadow-sm">
              <SectionHeader sectionKey="archivedCases" icon={Archive} title="Archived Cases" count={completedCases.length} isOpen={openSections.archivedCases} onToggle={toggleSection} />
              <CollapsibleContent>
                <div className="overflow-x-auto">
                  {filteredArchivedCases.length === 0 ? (
                    <div className="text-center py-8 px-4">
                      <p className="text-muted-foreground text-sm">No archived cases match your search.</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-accent/20 bg-muted/40">
                          <th className="text-left px-5 py-3 font-semibold text-foreground text-xs tracking-wide uppercase">Case Ref</th>
                          <th className="text-left px-5 py-3 font-semibold text-foreground text-xs tracking-wide uppercase">Property</th>
                          <th className="text-left px-5 py-3 font-semibold text-foreground text-xs tracking-wide uppercase hidden md:table-cell">Conveyancer</th>
                          <th className="text-left px-5 py-3 font-semibold text-foreground text-xs tracking-wide uppercase">Status</th>
                          <th className="text-left px-5 py-3 font-semibold text-foreground text-xs tracking-wide uppercase">Risk</th>
                          <th className="text-left px-5 py-3 font-semibold text-foreground text-xs tracking-wide uppercase hidden lg:table-cell">Completed</th>
                          <th className="px-3 py-3 w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredArchivedCases.map((c) => (
                          <tr key={c.id} className="border-b border-border/40 table-row-hover cursor-pointer">
                            <td className="px-5 py-3">
                              <Link to={`/agent/source-of-wealth?caseId=${c.id}`} className="font-mono text-accent hover:underline font-bold text-xs">
                                {c.case_reference}
                              </Link>
                            </td>
                            <td className="px-5 py-3 text-foreground max-w-xs truncate text-xs">{c.property_address}</td>
                            <td className="px-5 py-3 text-muted-foreground hidden md:table-cell text-xs">{c.conveyancer_name}</td>
                            <td className="px-5 py-3"><StatusBadge status={c.status as CaseStatus} /></td>
                            <td className="px-5 py-3">
                              {c.risk_level ? (
                                <RiskBadge level={c.risk_level as RiskLevel} score={c.risk_score ?? undefined} size="sm" />
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                              {new Date(c.updated_at).toLocaleDateString("en-GB")}
                            </td>
                            <td className="px-3 py-3">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <button
                                    className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                    title="Delete case"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete case?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete <strong>{c.case_reference}</strong> and all associated documents, reports, and data. Audit logs will be preserved for compliance. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={() => handleDeleteCase(c.id, c.case_reference)}
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {/* ── AI Confidence Calibration ─────────────────────── */}
        <Suspense fallback={null}>
          <AIConfidenceCalibrationPanel />
        </Suspense>

        {/* ── Firm Analytics Dashboard ─────────────────────── */}
        <Suspense fallback={null}>
          <FirmAnalyticsDashboard />
        </Suspense>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
