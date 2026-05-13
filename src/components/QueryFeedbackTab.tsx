import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, MessageSquare, AlertTriangle, CheckCircle2, Info, XCircle, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRateLimitHandler, isRateLimitError } from "@/hooks/useRateLimitHandler";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";

interface QueryFeedbackTabProps {
  caseId: string;
  caseReference: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  feedbackId?: string;
  assessment?: string;
  severity?: string;
  isEnhancementCandidate?: boolean;
}

const FEEDBACK_TYPES = [
  { value: "omission", label: "Omission" },
  { value: "overreach", label: "Overreach / Unnecessary Enquiry" },
  { value: "hallucination", label: "Hallucination / Invented Fact" },
  { value: "drafting_quality", label: "Drafting Quality Improvement" },
  { value: "workflow_improvement", label: "Workflow Improvement" },
];

const STORAGE_KEY_PREFIX = "qf_chat_";

const QueryFeedbackTab = ({ caseId, caseReference }: QueryFeedbackTabProps) => {
  const { toast } = useToast();
  const { checkAndHandle } = useRateLimitHandler();
  const [mode, setMode] = useState<"query" | "omission">("query");
  const [feedbackType, setFeedbackType] = useState("omission");
  const [message, setMessage] = useState("");
  const [logAsFeedback, setLogAsFeedback] = useState(false);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY_PREFIX + caseId);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Persist messages to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY_PREFIX + caseId, JSON.stringify(messages));
    } catch { /* quota exceeded — ignore */ }
  }, [messages, caseId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    sessionStorage.removeItem(STORAGE_KEY_PREFIX + caseId);
  }, [caseId]);

  const handleSend = async () => {
    if (!message.trim() || sending) return;

    const userMsg: ChatMessage = { role: "user", content: message.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setMessage("");
    setSending(true);

    try {
      const conversationHistory = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error } = await supabase.functions.invoke("agent-query", {
        body: {
          case_id: caseId,
          mode,
          message: userMsg.content,
          feedback_type: mode === "omission" ? feedbackType : undefined,
          conversation_history: conversationHistory,
          log_as_feedback: mode === "omission" ? true : logAsFeedback,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.response,
        feedbackId: data.feedback_id,
        assessment: data.assessment,
        severity: data.severity,
        isEnhancementCandidate: data.is_enhancement_candidate,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (data.feedback_logged) {
        toast({
          title: "Feedback logged",
          description: `Feedback ID: ${data.feedback_id?.substring(0, 8) || "N/A"}${data.is_enhancement_candidate ? " — Enhancement candidate created" : ""}`,
        });
      }
    } catch (e: any) {
      if (!checkAndHandle(e)) {
        toast({ title: "Query failed", description: e.message || "Unknown error", variant: "destructive" });
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: isRateLimitError(e) ? `⏳ Rate limit reached. Please wait before trying again.` : `Error: ${e.message || "Failed to process query."}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const assessmentBadge = (assessment?: string, severity?: string) => {
    if (!assessment) return null;
    return (
      <div className="flex gap-1.5 mt-2">
        <Badge variant="outline" className={
          assessment === "valid" ? "border-risk-green text-risk-green" :
          assessment === "partially_valid" ? "border-risk-amber text-risk-amber" :
          "border-risk-red text-risk-red"
        }>
          {assessment === "valid" ? "Valid" : assessment === "partially_valid" ? "Partially Valid" : "Not Supported"}
        </Badge>
        {severity && (
          <Badge variant="outline" className={
            severity === "critical" ? "border-risk-red text-risk-red" :
            severity === "major" ? "border-risk-amber text-risk-amber" :
            "border-muted-foreground text-muted-foreground"
          }>
            {severity.charAt(0).toUpperCase() + severity.slice(1)}
          </Badge>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare size={16} />
            Query the Agent / Feedback (Training)
          </CardTitle>
          {messages.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleNewChat} className="text-xs gap-1.5">
              <RotateCcw size={12} />
              New Chat
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Case: {caseReference} · Ask follow-up questions or report omissions for training feedback.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mode Selection */}
        <div className="flex gap-2">
          <Button
            variant={mode === "query" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("query")}
            className="text-xs"
          >
            <Info size={14} className="mr-1" />
            Mode A: Explain / Query
          </Button>
          <Button
            variant={mode === "omission" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("omission")}
            className="text-xs"
          >
            <AlertTriangle size={14} className="mr-1" />
            Mode B: Report Omission
          </Button>
        </div>

        {/* Feedback type selector for Mode B */}
        {mode === "omission" && (
          <Select value={feedbackType} onValueChange={setFeedbackType}>
            <SelectTrigger className="w-full text-xs">
              <SelectValue placeholder="Feedback type" />
            </SelectTrigger>
            <SelectContent>
              {FEEDBACK_TYPES.map((ft) => (
                <SelectItem key={ft.value} value={ft.value} className="text-xs">
                  {ft.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Log as feedback checkbox for Mode A */}
        {mode === "query" && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="logFeedback"
              checked={logAsFeedback}
              onCheckedChange={(checked) => setLogAsFeedback(!!checked)}
            />
            <label htmlFor="logFeedback" className="text-xs text-muted-foreground cursor-pointer">
              Log this interaction as training feedback
            </label>
          </div>
        )}

        {/* Chat messages */}
        <div className="border border-border rounded-lg bg-muted/20 max-h-[400px] overflow-y-auto">
          {messages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">
                {mode === "query"
                  ? "Ask a question about issues raised on this case"
                  : "Report an issue the Agent missed"}
              </p>
              <p className="text-xs mt-1">
                Case context, documents, and Agent outputs are auto-attached.
              </p>
            </div>
          ) : (
            <div className="p-3 space-y-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted border border-border"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown rehypePlugins={[rehypeRaw]}>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                    {msg.role === "assistant" && msg.feedbackId && (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <p className="text-[10px] text-muted-foreground font-mono">
                          Feedback ID: {msg.feedbackId.substring(0, 8)}
                          {msg.isEnhancementCandidate && " · Enhancement Candidate ✓"}
                        </p>
                        {assessmentBadge(msg.assessment, msg.severity)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === "query"
                ? "Ask about an issue raised on this case..."
                : "Describe what the Agent missed..."
            }
            className="min-h-[60px] text-sm resize-none"
            disabled={sending}
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim() || sending}
            size="icon"
            className="shrink-0 self-end"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground italic">
          This is decision-support only. A qualified conveyancer remains responsible for all advice and enquiries.
        </p>
      </CardContent>
    </Card>
  );
};

export default QueryFeedbackTab;
