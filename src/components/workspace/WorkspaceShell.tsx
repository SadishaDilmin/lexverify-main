import { Fragment, type ReactNode, useState } from "react";
import { lazy, Suspense } from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2, MessageSquare, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import AppLayout from "@/components/AppLayout";
import WorkspaceHeader from "./WorkspaceHeader";
import WorkspaceInfoBar, { type InfoItem } from "./WorkspaceInfoBar";
import WorkspaceWorkflow, { type WorkflowStep } from "./WorkspaceWorkflow";

const WorkspaceAssistantPanel = lazy(
  () => import("@/components/WorkspaceAssistantPanel")
);

export interface WorkspaceTab {
  value: string;
  icon: LucideIcon;
  label: string;
}

export interface AssistantConfig {
  agentId: string;
  label: string;
  auditEventType: string;
  contextSummary: string;
  systemPrompt: string;
  quickPrompts: string[];
  caseReference: string;
  documentCount?: number;
}

interface WorkspaceShellProps {
  /** Header */
  agentName: string;
  agentIcon: LucideIcon;
  caseReference: string;
  propertyAddress: string;
  headerSubtitle?: string;
  headerActions?: ReactNode;

  /** Info bar */
  infoItems?: InfoItem[];
  statusCard?: ReactNode;

  /** Guided workflow */
  workflowSteps?: WorkflowStep[];
  activeStepId?: string;
  workflowFooter?: ReactNode;
  workflowHeaderAction?: ReactNode;

  /** Tabs */
  tabs: WorkspaceTab[];
  /** Optional divider index — tabs after this index are separated by a divider */
  tabDividerAfter?: number;
  /** Section label shown before tabs (e.g. "Olimey AI") */
  tabSectionLabel?: string;
  activeTab: string;
  onTabChange: (tab: string) => void;

  /** Content rendered inside <TabsContent> — keyed by tab value */
  children: ReactNode;

  /** Content rendered between info bar and workflow (e.g. parties, banners) */
  extraContent?: ReactNode;

  /** AI Assistant sidebar */
  assistant?: AssistantConfig;
  assistantCollapsed: boolean;
  onToggleAssistant: () => void;
  /** Whether to show the assistant (e.g. only when results exist) */
  showAssistant?: boolean;
}

export default function WorkspaceShell({
  agentName,
  agentIcon,
  caseReference,
  propertyAddress,
  headerSubtitle,
  headerActions,
  infoItems,
  statusCard,
  workflowSteps,
  activeStepId,
  workflowFooter,
  workflowHeaderAction,
  tabs,
  tabDividerAfter,
  tabSectionLabel,
  activeTab,
  onTabChange,
  children,
  extraContent,
  assistant,
  assistantCollapsed,
  onToggleAssistant,
  showAssistant = true,
}: WorkspaceShellProps) {
  const shouldShowAssistant = showAssistant && !!assistant;
  const [mobileAssistantOpen, setMobileAssistantOpen] = useState(false);

  return (
    <AppLayout>
      <div className="flex gap-4 max-w-full">
        {/* Main content */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className={`flex-1 min-w-0 space-y-4 transition-all ${
            shouldShowAssistant && !assistantCollapsed ? "lg:mr-0" : ""
          }`}
        >
          {/* Header */}
          <WorkspaceHeader
            agentName={agentName}
            agentIcon={agentIcon}
            caseReference={caseReference}
            propertyAddress={propertyAddress}
            subtitle={headerSubtitle}
            actions={headerActions}
          />

          {/* Tabs wrapping everything below header */}
          <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-4">
            {/* Scrollable tab bar on mobile */}
            <div className="overflow-x-auto -mx-1 px-1 scrollbar-none">
              <TabsList className="bg-muted/50 flex flex-nowrap sm:flex-wrap h-auto gap-1 p-1.5 items-center rounded-xl min-w-max sm:min-w-0">
                {tabSectionLabel && (
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1 mr-1 hidden sm:inline">
                    {tabSectionLabel}
                  </span>
                )}
                {tabs.map((tab, idx) => (
                  <Fragment key={tab.value}>
                    {tabDividerAfter !== undefined && idx === tabDividerAfter + 1 && (
                      <div className="hidden sm:block w-px h-5 bg-border/60 mx-1 shrink-0" />
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <TabsTrigger value={tab.value} className="gap-1.5 text-xs rounded-lg whitespace-nowrap">
                          <tab.icon size={14} />
                          <span className="hidden sm:inline">{tab.label}</span>
                        </TabsTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="sm:hidden">
                        {tab.label}
                      </TooltipContent>
                    </Tooltip>
                  </Fragment>
                ))}
              </TabsList>
            </div>

            {/* Info bar */}
            {infoItems && infoItems.length > 0 && (
              <WorkspaceInfoBar items={infoItems} statusCard={statusCard} />
            )}

            {/* Extra content (parties, banners, flags) */}
            {extraContent}

            {/* Guided workflow */}
            {workflowSteps && workflowSteps.length > 0 && (
              <WorkspaceWorkflow
                steps={workflowSteps}
                activeStepId={activeStepId}
                footer={workflowFooter}
                headerAction={workflowHeaderAction}
              />
            )}

            {/* Tab content with enter animation */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </Tabs>
        </motion.div>

        {/* AI Assistant — Desktop sidebar */}
        {shouldShowAssistant && (
          <Suspense fallback={null}>
            <div
              className={`hidden lg:flex transition-all ${
                assistantCollapsed ? "w-0" : "w-[320px] min-w-[320px]"
              }`}
            >
              <WorkspaceAssistantPanel
                agentId={assistant!.agentId}
                label={assistant!.label}
                auditEventType={assistant!.auditEventType}
                contextSummary={assistant!.contextSummary}
                systemPrompt={assistant!.systemPrompt}
                quickPrompts={assistant!.quickPrompts}
                caseReference={assistant!.caseReference}
                collapsed={assistantCollapsed}
                onToggleCollapse={onToggleAssistant}
                documentCount={assistant!.documentCount}
              />
            </div>
            {assistantCollapsed && (
              <div className="hidden lg:block">
                <WorkspaceAssistantPanel
                  agentId={assistant!.agentId}
                  label={assistant!.label}
                  auditEventType={assistant!.auditEventType}
                  contextSummary={assistant!.contextSummary}
                  systemPrompt={assistant!.systemPrompt}
                  quickPrompts={assistant!.quickPrompts}
                  caseReference={assistant!.caseReference}
                  collapsed={true}
                  onToggleCollapse={onToggleAssistant}
                  documentCount={assistant!.documentCount}
                />
              </div>
            )}
          </Suspense>
        )}

        {/* AI Assistant — Mobile sheet (floating action button) */}
        {shouldShowAssistant && (
          <div className="lg:hidden fixed bottom-5 right-5 z-50">
            <Sheet open={mobileAssistantOpen} onOpenChange={setMobileAssistantOpen}>
              <SheetTrigger asChild>
                <Button
                  size="icon"
                  className="h-14 w-14 rounded-full shadow-lg bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  <MessageSquare size={22} />
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[75vh] p-0 rounded-t-2xl">
                <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-muted-foreground" /></div>}>
                  <WorkspaceAssistantPanel
                    agentId={assistant!.agentId}
                    label={assistant!.label}
                    auditEventType={assistant!.auditEventType}
                    contextSummary={assistant!.contextSummary}
                    systemPrompt={assistant!.systemPrompt}
                    quickPrompts={assistant!.quickPrompts}
                    caseReference={assistant!.caseReference}
                    collapsed={false}
                    onToggleCollapse={() => setMobileAssistantOpen(false)}
                    documentCount={assistant!.documentCount}
                  />
                </Suspense>
              </SheetContent>
            </Sheet>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
