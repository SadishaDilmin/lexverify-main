import { ReactNode, useState, useMemo, lazy, Suspense } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ReferralWidget from "@/components/ReferralWidget";
import NotificationBell from "@/components/NotificationBell";
import CreditBadge from "@/components/CreditBadge";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  FolderPlus,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  ClipboardList,
  MessageSquare,
  Sparkles,
  Gift,
  PoundSterling,
  Coins,
  ShoppingCart,
  Receipt,
  BookOpen,
  Activity,
  UserPlus,
  ChevronDown,
  ShieldCheck,
  Link2,
  Globe,
  PanelLeftOpen,
  PanelLeftClose,
  Headphones,
  ClipboardCheck,
  FlaskConical,
  FileCode2,
  Dna,
  BarChart3,
  HelpCircle,
  Bell,
  ShieldAlert,
  Brain,
  Fingerprint,
  Plug,
  Scale,
  ListChecks,
} from "lucide-react";
import LexSentinelLogo from "./LexSentinelLogo";
const ProactiveFeed = lazy(() => import("./ProactiveFeed"));
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/hooks/useCredits";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import FloatingCaseFiles from "@/components/FloatingCaseFiles";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  adminOnly?: boolean;
  badge?: number;
}

interface NavGroup {
  title: string;
  icon: React.ElementType;
  items: NavItem[];
  adminOnly?: boolean;
  defaultOpen?: boolean;
}

const SIDEBAR_KEY = "ls-sidebar-collapsed";

type ContentWidth = "default" | "full";

const AppLayout = ({
  children,
  contentWidth = "default",
}: {
  children: ReactNode;
  contentWidth?: ContentWidth;
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, role, signOut } = useAuth();
  const { data: credits } = useCredits();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    return stored !== null ? stored === "true" : true; // collapsed by default
  });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(SIDEBAR_KEY, String(next));
  };

  const { data: pendingTrialCount = 0 } = useQuery({
    queryKey: ["free_trial_pending_count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("free_trial_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) return 0;
      return count || 0;
    },
    enabled: role === "admin",
    refetchInterval: 60_000,
  });

  const navGroups: NavGroup[] = useMemo(() => {
    const groups: NavGroup[] = [
      {
        title: "Main",
        icon: LayoutDashboard,
        defaultOpen: true,
        items: [
          { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
          { to: "/dashboard/oversight-queue", icon: ShieldAlert, label: "Oversight Queue" },
          { to: "/case/new", icon: FolderPlus, label: "New Case" },
        ],
      },
      {
        title: "Credits & Billing",
        icon: Coins,
        items: [
          { to: "/buy-credits", icon: ShoppingCart, label: "Buy Credits" },
          { to: "/transactions", icon: Receipt, label: "Transactions" },
          { to: "/pricing", icon: PoundSterling, label: "Pricing" },
        ],
      },
      {
        title: "Administration",
        icon: ShieldCheck,
        adminOnly: true,
        items: [
          { to: "/admin/users", icon: Users, label: "Users", adminOnly: true },
          { to: "/admin/feedback", icon: MessageSquare, label: "Feedback", adminOnly: true },

          { to: "/admin/free-trials", icon: Gift, label: "Free Trials", adminOnly: true, badge: pendingTrialCount },
          { to: "/admin/knowledge-base", icon: BookOpen, label: "Knowledge Base", adminOnly: true },
          { to: "/admin/retrieval-logs", icon: Activity, label: "Retrieval Logs", adminOnly: true },
          { to: "/admin/evidence-audit", icon: ShieldAlert, label: "Evidence Audit", adminOnly: true },
          { to: "/admin/referrals", icon: UserPlus, label: "Referrals", adminOnly: true },
          { to: "/admin/glossary", icon: BookOpen, label: "Glossary", adminOnly: true },
          { to: "/admin/cms-integrations", icon: Link2, label: "CMS Integrations", adminOnly: true },
          { to: "/admin/approved-domains", icon: Globe, label: "Approved Domains", adminOnly: true },
          { to: "/admin/ai-chat-logs", icon: MessageSquare, label: "AI Chat Logs", adminOnly: true },
          { to: "/admin/article-audio", icon: Headphones, label: "Article Audio", adminOnly: true },
          { to: "/admin/document-checklists", icon: ClipboardCheck, label: "Doc Checklists", adminOnly: true },
          { to: "/admin/benchmark-dashboard", icon: FlaskConical, label: "AI Learning Engine", adminOnly: true },
          { to: "/admin/prompt-management", icon: FileCode2, label: "Prompt Management", adminOnly: true },
          { to: "/admin/synthetic-generator", icon: Dna, label: "Synthetic Cases", adminOnly: true },
          { to: "/admin/stress-test", icon: ShieldAlert, label: "Stress Test", adminOnly: true },
          { to: "/admin/self-healing", icon: Brain, label: "Self-Healing AI", adminOnly: true },
          { to: "/admin/stability-manifest", icon: Fingerprint, label: "Stability Manifest", adminOnly: true },
          { to: "/admin/integrations", icon: Plug, label: "Integrations", adminOnly: true },
          { to: "/admin/compliance-dashboard", icon: Scale, label: "Compliance Dashboard", adminOnly: true },
          { to: "/admin/ai-help-guide", icon: HelpCircle, label: "AI Engine Help", adminOnly: true },
          { to: "/admin/notifications", icon: Bell, label: "Notifications", adminOnly: true },
          { to: "/admin/profile-smoke-test", icon: ListChecks, label: "Profile Smoke Test", adminOnly: true },
        ],
      },
      {
        title: "Account",
        icon: Settings,
        items: [
          { to: "/audit-log", icon: ClipboardList, label: "Audit Log" },
          { to: "/settings", icon: Settings, label: "Settings" },
        ],
      },
    ];
    return groups;
  }, [pendingTrialCount]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const renderNavLink = (item: NavItem, onClick?: () => void) => {
    if (item.adminOnly && role !== "admin") return null;
    const active = location.pathname.startsWith(item.to);

    if (collapsed) {
      return (
        <Tooltip key={item.to}>
          <TooltipTrigger asChild>
            <Link
              to={item.to}
              onClick={onClick}
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150 mx-auto relative",
                active
                  ? "bg-sidebar-accent text-sidebar-primary font-semibold"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon size={18} />
              {(item.badge ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground px-1">
                  {item.badge}
                </span>
              )}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Link
        key={item.to}
        to={item.to}
        onClick={onClick}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
          active
            ? "bg-sidebar-accent text-sidebar-primary nav-active-bar font-semibold"
            : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
        )}
      >
        <item.icon size={16} />
        {item.label}
        {(item.badge ?? 0) > 0 && (
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground px-1.5">
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  const renderGroup = (group: NavGroup, onClick?: () => void) => {
    if (group.adminOnly && role !== "admin") return null;
    const groupActive = group.items.some(
      (item) => !(item.adminOnly && role !== "admin") && location.pathname.startsWith(item.to)
    );

    if (collapsed) {
      return (
        <div key={group.title} className="space-y-1 py-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center justify-center w-10 h-10 mx-auto text-sidebar-foreground/40">
                <group.icon size={14} />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">{group.title}</TooltipContent>
          </Tooltip>
          {group.items.map((item) => renderNavLink(item, onClick))}
        </div>
      );
    }

    return (
      <Collapsible key={group.title} defaultOpen={group.defaultOpen || groupActive}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 text-[11px] uppercase tracking-wider font-semibold text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors group">
          <group.icon size={13} className="shrink-0" />
          <span className="flex-1 text-left">{group.title}</span>
          <ChevronDown size={13} className="transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-0.5 pl-2 mt-0.5">
          {group.items.map((item) => renderNavLink(item, onClick))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col sentinel-gradient border-r border-sidebar-border transition-all duration-300",
          collapsed ? "w-16" : "w-64"
        )}
      >
        <div className={cn("border-b border-sidebar-border flex items-center", collapsed ? "p-2 justify-center" : "p-5")}>
          <Link to="/dashboard">
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-10 h-10 rounded-lg bg-sidebar-accent flex items-center justify-center">
                    <span className="text-sm font-bold text-sidebar-foreground">LS</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">Dashboard</TooltipContent>
              </Tooltip>
            ) : (
              <LexSentinelLogo size="md" />
            )}
          </Link>
        </div>

        <nav className={cn("flex-1 overflow-y-auto", collapsed ? "p-1 space-y-0" : "p-3 space-y-1")}>
          {navGroups.map((group) => renderGroup(group))}
        </nav>

        {/* Proactive Feed */}
        <Suspense fallback={null}>
          <ProactiveFeed collapsed={collapsed} />
        </Suspense>

        <div className={cn("border-t border-sidebar-border", collapsed ? "p-2" : "p-4")}>
          {/* Credits */}
          {credits && !collapsed && (
            <Link to="/buy-credits" className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-sidebar-accent/30 hover:bg-sidebar-accent/50 transition-colors border border-sidebar-border">
              <Coins size={14} className="text-accent" />
              <span className="text-xs font-bold text-sidebar-foreground">{credits.balance} credits</span>
              {credits.is_free_trial && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-semibold">Trial</span>
              )}
            </Link>
          )}
          {credits && collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link to="/buy-credits" className="flex items-center justify-center w-10 h-10 mx-auto rounded-lg bg-sidebar-accent/30 hover:bg-sidebar-accent/50 transition-colors mb-2">
                  <Coins size={16} className="text-accent" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{credits.balance} credits</TooltipContent>
            </Tooltip>
          )}

          {/* User section */}
          {!collapsed && (
            <>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-sidebar-accent flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-sidebar-foreground">
                    {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-sidebar-foreground truncate">{profile?.full_name ?? "User"}</div>
                  <div className="text-[11px] text-sidebar-foreground/50 truncate">{profile?.position || profile?.email || ""}</div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 px-2"
                onClick={handleSignOut}
              >
                <LogOut size={14} className="mr-2" />
                Sign out
              </Button>
              <div className="flex gap-3 mt-2">
                <Link to="/terms" target="_blank" className="text-[10px] text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors">Terms</Link>
                <Link to="/privacy" target="_blank" className="text-[10px] text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors">Privacy</Link>
              </div>
              {role === "admin" && (
                <div className="mt-3 flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5">
                  <ShieldCheck size={12} className="text-primary shrink-0" />
                  <span className="text-[10px] font-semibold text-primary tracking-wide">Certified Stable — Mar 2026</span>
                </div>
              )}
            </>
          )}
          {collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSignOut}
                  className="flex items-center justify-center w-10 h-10 mx-auto rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
                >
                  <LogOut size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Sign out</TooltipContent>
            </Tooltip>
          )}

          {/* Collapse toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleCollapsed}
                className={cn(
                  "mt-2 flex items-center rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors",
                  collapsed ? "justify-center w-10 h-10 mx-auto" : "gap-2 w-full px-2 py-2 text-xs"
                )}
              >
                {collapsed ? <PanelLeftOpen size={16} /> : <><PanelLeftClose size={14} /> <span>Collapse</span></>}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? "Expand menu" : "Collapse menu"}</TooltipContent>
          </Tooltip>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="lg:hidden sentinel-gradient px-4 py-3 flex items-center justify-between">
          <Link to="/dashboard"><LexSentinelLogo size="sm" /></Link>
          <button onClick={() => setMobileOpen(!mobileOpen)} className="text-primary-foreground">
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </header>

        {/* Mobile nav overlay */}
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:hidden sentinel-gradient px-4 pb-4 space-y-1 overflow-y-auto max-h-[70vh]"
          >
            {navGroups.map((group) => renderGroup(group, () => setMobileOpen(false)))}
          </motion.div>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div
            className={cn(
              "flex items-center justify-end gap-3 px-6 lg:px-8 pt-4 pb-0",
              contentWidth === "default" && "max-w-7xl mx-auto",
            )}
          >
            <CreditBadge />
            <NotificationBell />
            <ReferralWidget asDialog />
          </div>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "p-6 lg:p-8 pt-3",
              contentWidth === "default" && "max-w-7xl mx-auto",
            )}
          >
            {children}
          </motion.div>
          <FloatingCaseFiles />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
