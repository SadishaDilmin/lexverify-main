import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Loader2, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-chat`;

const SupportChatWidget = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const streamChat = useCallback(async (allMessages: ChatMessage[]) => {
    setError(null);
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages: allMessages }),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Request failed (${resp.status})`);
    }

    if (!resp.body) throw new Error("No response stream");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let assistantSoFar = "";
    let streamDone = false;
    
    // Track multiple tool calls
    const toolCalls: Record<number, { name: string; args: string }> = {};

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") {
          streamDone = true;
          break;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta;
          
          // Check for tool calls
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCalls[idx]) {
                toolCalls[idx] = { name: tc.function?.name || "", args: "" };
              }
              if (tc.function?.name) toolCalls[idx].name = tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].args += tc.function.arguments;
            }
            continue;
          }

          const content = delta?.content as string | undefined;
          if (content) {
            assistantSoFar += content;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return prev.map((m, i) =>
                  i === prev.length - 1 ? { ...m, content: assistantSoFar } : m
                );
              }
              return [...prev, { role: "assistant", content: assistantSoFar }];
            });
          }
        } catch {
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }

    // Process all tool calls
    for (const tc of Object.values(toolCalls)) {
      if (tc.name === "escalate_to_support") {
        let reason = "Your issue requires human attention.";
        try {
          const args = JSON.parse(tc.args);
          reason = args.reason || reason;
        } catch {}
        await handleEscalation(reason, allMessages);
      } else if (tc.name === "navigate_to_page") {
        try {
          const args = JSON.parse(tc.args);
          handleNavigation(args.path, args.message);
        } catch {}
      }
    }
  }, []);

  const handleNavigation = (path: string, message: string) => {
    // Show the navigation message in chat
    const navMsg = message || `Taking you to **${path}**...`;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        // Append to existing assistant message
        return prev.map((m, i) =>
          i === prev.length - 1
            ? { ...m, content: m.content ? m.content + "\n\n" + navMsg : navMsg }
            : m
        );
      }
      return [...prev, { role: "assistant", content: navMsg }];
    });

    // Navigate after a short delay so the user sees the message
    setTimeout(() => {
      navigate(path);
    }, 600);
  };

  const handleEscalation = async (reason: string, conversation: ChatMessage[]) => {
    setEscalated(true);
    
    const escalationMsg = `I've escalated your issue to our support team at **help@lexsentinel.ai**. They'll review the details and get back to you.\n\n**Reason**: ${reason}\n\nYou can also email us directly at [help@lexsentinel.ai](mailto:help@lexsentinel.ai).`;
    
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        return prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, content: escalationMsg } : m
        );
      }
      return [...prev, { role: "assistant", content: escalationMsg }];
    });

    // Save escalation to DB
    try {
      await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          action: "escalate",
          messages: conversation,
          summary: reason,
          userId: user?.id || null,
          userEmail: profile?.email || user?.email || "",
          userName: profile?.full_name || "",
        }),
      });
    } catch (e) {
      console.error("Failed to save escalation:", e);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || escalated) return;

    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      await streamChat(newMessages);
    } catch (e: any) {
      console.error("Chat error:", e);
      setError(e.message || "Something went wrong. Please try again.");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I'm having trouble connecting right now. Please try again or email us at [help@lexsentinel.ai](mailto:help@lexsentinel.ai).",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setEscalated(false);
    setError(null);
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-accent text-accent-foreground shadow-lg hover:shadow-xl transition-all hover:scale-105"
          aria-label="Open support chat"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-3rem)] flex flex-col rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="sentinel-gradient px-4 py-3 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-sm font-semibold text-primary-foreground font-sans">
                Olimey AI Support
              </h3>
              <p className="text-[10px] text-primary-foreground/70">
                Ask anything · I can navigate you too
              </p>
            </div>
            <div className="flex gap-1">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNewChat}
                  className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10 text-[10px] h-7 px-2"
                >
                  New chat
                </Button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-primary-foreground/70 hover:text-primary-foreground p-1"
                aria-label="Close chat"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <MessageCircle size={28} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">How can we help?</p>
                <p className="text-xs mt-1">
                  Ask about features, navigation, credits, or say <strong>"Take me to…"</strong>
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5 justify-center">
                  {["Take me to my dashboard", "How do credits work?", "Create a new case"].map(
                    (q) => (
                      <button
                        key={q}
                        onClick={() => {
                          setInput(q);
                          setTimeout(() => {
                            const userMsg: ChatMessage = { role: "user", content: q };
                            const newMsgs = [userMsg];
                            setMessages(newMsgs);
                            setInput("");
                            setIsLoading(true);
                            streamChat(newMsgs)
                              .catch(() => {})
                              .finally(() => setIsLoading(false));
                          }, 0);
                        }}
                        className="text-[11px] px-2.5 py-1.5 rounded-full border border-border bg-muted/30 hover:bg-muted text-foreground transition-colors"
                      >
                        {q}
                      </button>
                    )
                  )}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    msg.role === "user"
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted border border-border"
                  )}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p>{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex justify-start">
                <div className="bg-muted border border-border rounded-lg px-3 py-2">
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                <AlertTriangle size={12} />
                {error}
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-border p-3 shrink-0">
            {escalated ? (
              <div className="text-center text-xs text-muted-foreground py-2">
                This conversation has been escalated.{" "}
                <button onClick={handleNewChat} className="text-accent hover:underline">
                  Start a new chat
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your question or 'Take me to…'"
                  className="min-h-[40px] max-h-[80px] text-sm resize-none"
                  disabled={isLoading}
                />
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  size="icon"
                  className="shrink-0 self-end"
                >
                  {isLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                </Button>
              </div>
            )}
            <p className="text-[9px] text-muted-foreground mt-1.5 text-center italic">
              Support assistant only — not legal advice. A qualified conveyancer remains responsible for all decisions.
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default SupportChatWidget;
