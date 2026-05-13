import { useState } from "react";
import { Upload, Bell, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { agents, getVisibleAgents } from "@/config/agents";
import type { AgentConfig } from "@/config/agents";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onSelectTool: (tab: string) => void;
  aiBlocked?: boolean;
  caseId?: string;
}

/** Maps agent IDs to workspace tab values for case-review agents */
const AGENT_TAB_MAP: Record<string, string> = {};

/** Agents that navigate to their own page instead of a tab */
const AGENT_NAV_MAP: Record<string, string> = {};

export default function CaseToolChooser({ onSelectTool, aiBlocked = false, caseId }: Props) {
  const navigate = useNavigate();
  const { user, profile, role } = useAuth();
  const { toast } = useToast();
  const [notified, setNotified] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<string | null>(null);

  const visibleAgents = getVisibleAgents(role);
  const availableAgents = visibleAgents.filter((a) => a.available);
  const upcomingAgents = visibleAgents.filter((a) => !a.available);

  const handleSelect = (agent: AgentConfig) => {
    const tab = AGENT_TAB_MAP[agent.id];
    if (tab) {
      onSelectTool(tab);
    } else if (AGENT_NAV_MAP[agent.id]) {
      const params = caseId ? `?caseId=${caseId}` : "";
      navigate(`${AGENT_NAV_MAP[agent.id]}${params}`);
    } else {
      const params = caseId ? `?caseId=${caseId}` : "";
      navigate(`/agent/${agent.id}${params}`);
    }
  };

  const handleNotifyMe = async (agent: AgentConfig) => {
    if (!user || !profile) {
      toast({ title: "Please sign in", description: "You need to be signed in to register interest.", variant: "destructive" });
      return;
    }
    setSubmitting(agent.id);
    try {
      const { error } = await supabase.from("agent_interest").insert({
        agent_type: agent.id,
        full_name: profile.full_name,
        email: profile.email,
        firm_name: profile.firm_name || "",
        message: `Interest registered from tool chooser for: ${agent.name}`,
      });
      if (error) throw error;
      setNotified((prev) => new Set(prev).add(agent.id));
      toast({ title: "You're on the list!", description: `We'll notify you when ${agent.name} launches.` });
    } catch {
      toast({ title: "Something went wrong", description: "Please try again later.", variant: "destructive" });
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1 py-2">
        <h2 className="text-lg font-semibold text-foreground">Choose an AI Tool</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Select which AI-powered tool you'd like to use on this case. You can always switch tools or run additional reviews later.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
        {availableAgents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => !aiBlocked && handleSelect(agent)}
            disabled={aiBlocked}
            className={`text-left group ${aiBlocked ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <Card className={`border-border transition-all duration-200 h-full ${aiBlocked ? "bg-muted/30" : "hover:border-accent/60 group-hover:shadow-md group-hover:shadow-accent/5"}`}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${aiBlocked ? "bg-muted" : "bg-accent/10 group-hover:bg-accent/20"} transition-colors`}>
                    <agent.icon size={20} className={aiBlocked ? "text-muted-foreground" : "text-accent"} />
                  </div>
                  <Badge variant="outline" className="text-[10px] font-medium text-muted-foreground">
                    {agent.category}
                  </Badge>
                  {aiBlocked && (
                    <Badge variant="destructive" className="text-[10px] ml-auto">Blocked</Badge>
                  )}
                </div>
                <div>
                  <h3 className={`font-semibold text-sm mb-1 ${aiBlocked ? "text-muted-foreground" : "text-foreground"}`}>{agent.name}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-2">{agent.description}</p>
                  {agent.details.length > 0 && (
                    <ul className="space-y-1">
                      {agent.details.slice(0, 3).map((detail, idx) => (
                        <li key={idx} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                          <span className="text-accent mt-0.5">•</span>
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {agent.creditCost != null && (
                  <p className="text-[10px] text-muted-foreground">
                    {agent.creditCost} credit{agent.creditCost !== 1 ? "s" : ""} per use
                  </p>
                )}
                {!aiBlocked && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                    <Upload size={12} />
                    Get started
                  </div>
                )}
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {upcomingAgents.length > 0 && (
        <>
          <div className="text-center pt-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Coming Soon</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {upcomingAgents.map((agent) => {
              const isNotified = notified.has(agent.id);
              const isSubmitting = submitting === agent.id;
              return (
                <div key={agent.id} className="opacity-60">
                  <Card className="border-border h-full">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <agent.icon size={20} className="text-muted-foreground" />
                        </div>
                        <Badge variant="secondary" className="text-[10px] font-medium">
                          Coming Soon
                        </Badge>
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground text-sm mb-1">{agent.name}</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{agent.description}</p>
                      </div>
                      <Button
                        variant={isNotified ? "ghost" : "outline"}
                        size="sm"
                        disabled={isNotified || isSubmitting}
                        onClick={() => handleNotifyMe(agent)}
                        className="w-full text-xs"
                      >
                        {isNotified ? (
                          <>
                            <Check size={12} className="mr-1.5" />
                            You'll be notified
                          </>
                        ) : (
                          <>
                            <Bell size={12} className="mr-1.5" />
                            {isSubmitting ? "Submitting…" : "Notify Me"}
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
