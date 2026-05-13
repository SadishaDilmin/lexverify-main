import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Send, Loader2, PanelRightClose, Sparkles, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface WorkspaceAssistantPanelProps {
  /** Agent ID for the chat endpoint */
  agentId: string;
  /** Display label e.g. "Draft Review Assistant" */
  label: string;
  /** Audit event type e.g. "draft_review_ai_chat" */
  auditEventType: string;
  /** Context summary injected into the system prompt */
  contextSummary: string;
  /** System prompt for the AI */
  systemPrompt: string;
  /** Quick prompt suggestions */
  quickPrompts: string[];
  /** Case reference for audit logging */
  caseReference?: string;
  /** Whether panel is collapsed */
  collapsed: boolean;
  /** Toggle collapse */
  onToggleCollapse: () => void;
  /** Optional document count for display */
  documentCount?: number;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-chat`;

async function streamChat({
  agentId,
  messages,
  onDelta,
  onDone,
  onError,
}: {
  agentId: string;
  messages: { role: string; content: string }[];
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ agentId, messages }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => null);
    const msg =
      resp.status === 429 ? "Rate limit exceeded. Please wait." :
      resp.status === 402 ? "Usage limit reached. Please top up credits." :
      body?.error || "Something went wrong.";
    onError(msg);
    return;
  }

  if (!resp.body) { onError("No response stream"); return; }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let done = false;

  while (!done) {
    const { done: d, value } = await reader.read();
    if (d) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") { done = true; break; }
      try {
        const p = JSON.parse(json);
        const c = p.choices?.[0]?.delta?.content;
        if (c) onDelta(c);
      } catch { buf = line + "\n" + buf; break; }
    }
  }
  onDone();
}

export default function WorkspaceAssistantPanel({
  agentId,
  label,
  auditEventType,
  contextSummary,
  systemPrompt,
  quickPrompts,
  caseReference,
  collapsed,
  onToggleCollapse,
  documentCount,
}: WorkspaceAssistantPanelProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const logChatToAudit = useCallback(async (userMessage: string, assistantResponse: string) => {
    if (!profile) return;
    try {
      await supabase.from("audit_log").insert({
        case_reference: caseReference || null,
        user_id: profile.user_id,
        user_name: profile.full_name,
        user_email: profile.email,
        user_position: profile.position || "",
        event_type: auditEventType,
        metadata: {
          user_message: userMessage.slice(0, 2000),
          assistant_response: assistantResponse.slice(0, 4000),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.error("Failed to log chat to audit:", e);
    }
  }, [profile, caseReference, auditEventType]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    const apiMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `[WORKSPACE CONTEXT — do not repeat this back to the user]\n${contextSummary}` },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: text },
    ];

    let acc = "";
    const upsert = (chunk: string) => {
      acc += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: acc } : m));
        }
        return [...prev, { role: "assistant", content: acc }];
      });
    };

    await streamChat({
      agentId,
      messages: apiMessages,
      onDelta: upsert,
      onDone: () => {
        setIsLoading(false);
        logChatToAudit(text, acc);
      },
      onError: (msg) => {
        setIsLoading(false);
        toast({ title: "Assistant error", description: msg, variant: "destructive" });
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${msg}` }]);
        logChatToAudit(text, `[ERROR] ${msg}`);
      },
    });
  }, [input, isLoading, messages, systemPrompt, contextSummary, agentId, toast, logChatToAudit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (collapsed) {
    return (
      <Button
        variant="outline"
        size="icon"
        className="fixed right-4 top-1/2 -translate-y-1/2 z-30 h-10 w-10 rounded-full shadow-lg border-accent/30 bg-background hover:bg-accent/10"
        onClick={onToggleCollapse}
        title={`Open ${label}`}
      >
        <Bot size={18} className="text-accent" />
      </Button>
    );
  }

  return (
    <div className="flex flex-col h-full border-l border-border bg-background max-h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded bg-accent/10 flex items-center justify-center">
            <Bot size={12} className="text-accent" />
          </div>
          <div>
            <h3 className="text-[11px] font-semibold text-foreground leading-tight">{label}</h3>
          </div>
          {documentCount != null && documentCount > 0 && (
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-1">
              <FileText size={9} className="mr-0.5" />
              {documentCount} doc{documentCount !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onToggleCollapse}>
          <PanelRightClose size={12} />
        </Button>
      </div>

      {/* Quick actions – scrollable row */}
      <div className="px-2 py-1 border-b border-border">
        <div className="flex flex-wrap gap-0.5">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              className="text-[9px] px-1.5 py-0.5 rounded-full border border-border hover:bg-accent/10 hover:border-accent/30 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setInput(prompt)}
              disabled={isLoading}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5 min-h-0">
        {messages.length === 0 ? (
          <div className="flex items-center gap-2 py-3 px-1 text-center">
            <Sparkles size={14} className="text-accent shrink-0" />
            <p className="text-[10px] text-muted-foreground">
              Ask about the analysis, findings, or documents in this workspace.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[90%] rounded-lg px-2 py-1.5 text-[11px] ${
                    msg.role === "user"
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted border border-border"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-xs max-w-none dark:prose-invert [&_p]:text-[11px] [&_li]:text-[11px] [&_h1]:text-xs [&_h2]:text-[11px] [&_h3]:text-[11px]">
                      <ReactMarkdown rehypePlugins={[rehypeRaw]}>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p>{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-2 py-1.5 border-t border-border">
        <div className="flex gap-1">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about findings, flags, documents…"
            className="min-h-[32px] max-h-[60px] text-[11px] resize-none py-1.5"
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="shrink-0 self-end h-7 w-7"
          >
            {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          </Button>
        </div>
      </div>
    </div>
  );
}
