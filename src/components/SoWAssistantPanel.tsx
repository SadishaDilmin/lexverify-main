import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Bot, Send, Loader2, PanelRightClose, Sparkles, FileText, Pencil, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import type { AttachedFile } from "@/components/AgentChatFileAttachment";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface FormContext {
  propertyAddress: string;
  purchasePrice: string;
  caseReference: string;
  tenure: string;
  stampDuty: string;
  legalFees: string;
  purchasers: { fullName: string; fundingSource: string; contributionAmount: string; employmentStatus: string }[];
  giftors: { fullName: string; fundingSource: string; contributionAmount: string; relationshipToPurchaser: string }[];
  openBankingFileNames: string[];
  purchaseInstructionFileNames: string[];
  attachedFileNames: string[];
  result: string;
  openBankingFiles?: AttachedFile[];
  purchaseInstructionFiles?: AttachedFile[];
  attachedFiles?: AttachedFile[];
  personFiles?: { personName: string; files: AttachedFile[] }[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Structured form edit command from AI */
export interface FormEditCommand {
  field: string;
  value: string;
  personIndex?: number;
  personRole?: "Purchaser" | "Giftor";
  reason: string;
}

interface SoWAssistantPanelProps {
  formContext: FormContext;
  streamChat: (params: {
    agentId: string;
    messages: { role: string; content: string }[];
    files?: any[];
    onDelta: (chunk: string) => void;
    onDone: () => void;
    onError: (msg: string) => void;
  }) => Promise<void>;
  onApplyEdits?: (edits: FormEditCommand[]) => void;
  onAddNote?: (note: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  caseReference?: string;
}

function buildContextSummary(ctx: FormContext): string {
  const lines: string[] = ["## Current Form State"];
  if (ctx.propertyAddress) lines.push(`- **Property:** ${ctx.propertyAddress}`);
  if (ctx.purchasePrice) lines.push(`- **Purchase Price:** £${ctx.purchasePrice}`);
  if (ctx.caseReference) lines.push(`- **Case Ref:** ${ctx.caseReference}`);
  if (ctx.tenure) lines.push(`- **Tenure:** ${ctx.tenure}`);
  if (ctx.stampDuty) lines.push(`- **Stamp Duty:** £${ctx.stampDuty}`);
  if (ctx.legalFees) lines.push(`- **Legal Fees:** £${ctx.legalFees}`);

  if (ctx.purchasers.length > 0) {
    lines.push(`\n### Purchasers (${ctx.purchasers.length})`);
    ctx.purchasers.forEach((p, i) => {
      lines.push(`${i + 1}. **${p.fullName || "Unnamed"}** — Funding: ${p.fundingSource || "Not set"}, Contribution: ${p.contributionAmount || "Not set"}, Employment: ${p.employmentStatus || "Not set"}`);
    });
  }

  if (ctx.giftors.length > 0) {
    lines.push(`\n### Giftors (${ctx.giftors.length})`);
    ctx.giftors.forEach((g, i) => {
      lines.push(`${i + 1}. **${g.fullName || "Unnamed"}** — Funding: ${g.fundingSource || "Not set"}, Contribution: ${g.contributionAmount || "Not set"}, Relationship: ${g.relationshipToPurchaser || "Not set"}`);
    });
  }

  const allDocs = [...ctx.openBankingFileNames, ...ctx.purchaseInstructionFileNames, ...ctx.attachedFileNames];
  if (allDocs.length > 0) {
    lines.push(`\n### Uploaded Documents (${allDocs.length})`);
    if (ctx.openBankingFileNames.length) lines.push(`- **Open Banking:** ${ctx.openBankingFileNames.join(", ")}`);
    if (ctx.purchaseInstructionFileNames.length) lines.push(`- **Purchase Instruction:** ${ctx.purchaseInstructionFileNames.join(", ")}`);
    if (ctx.attachedFileNames.length) lines.push(`- **Supporting:** ${ctx.attachedFileNames.join(", ")}`);
  }

  if (ctx.personFiles?.length) {
    for (const pf of ctx.personFiles) {
      if (pf.files.length > 0) {
        lines.push(`- **${pf.personName}'s docs:** ${pf.files.map(f => f.name).join(", ")}`);
      }
    }
  }

  if (ctx.result) {
    const preview = ctx.result.length > 500 ? ctx.result.slice(0, 500) + "…" : ctx.result;
    lines.push(`\n### Assessment Output (preview)\n${preview}`);
  }

  return lines.join("\n");
}

function collectAllFiles(ctx: FormContext): AttachedFile[] {
  const all: AttachedFile[] = [];
  if (ctx.openBankingFiles) all.push(...ctx.openBankingFiles);
  if (ctx.purchaseInstructionFiles) all.push(...ctx.purchaseInstructionFiles);
  if (ctx.attachedFiles) all.push(...ctx.attachedFiles);
  if (ctx.personFiles) {
    for (const pf of ctx.personFiles) {
      all.push(...pf.files);
    }
  }
  const seen = new Set<string>();
  return all.filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });
}

/** Parse structured JSON edit commands from AI response */
function parseEditCommands(content: string): FormEditCommand[] {
  const regex = /```json:form-edit\s*([\s\S]*?)```/g;
  const edits: FormEditCommand[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        edits.push(...parsed);
      } else {
        edits.push(parsed);
      }
    } catch { /* ignore malformed */ }
  }
  return edits;
}

/** Parse note commands from AI response */
function parseNoteCommands(content: string): string[] {
  const regex = /```text:add-note\s*([\s\S]*?)```/g;
  const notes: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    const note = match[1].trim();
    if (note) notes.push(note);
  }
  return notes;
}

/** Strip edit/note command blocks from visible content */
function stripCommandBlocks(content: string): string {
  return content
    .replace(/```json:form-edit[\s\S]*?```/g, "")
    .replace(/```text:add-note[\s\S]*?```/g, "")
    .trim();
}

const SYSTEM_CONTEXT = `You are an AI assistant embedded in the Olimey AI Source of Wealth assessment form. You help conveyancers by:
1. Answering questions about uploaded documents and form data
2. Suggesting and making corrections to form fields based on document analysis
3. Highlighting potential issues or inconsistencies
4. Explaining regulatory requirements
5. Adding important conversation points as notes on the case file

You have access to the current form state AND the full contents of all uploaded documents. When the user asks about a specific document, analyse its contents thoroughly and reference specific details from the document.

## FORM EDITING
When the user asks you to correct, update, or change form fields, output a JSON block to apply edits:

\`\`\`json:form-edit
[{"field": "propertyAddress", "value": "123 New Street", "reason": "Corrected based on title deed"}]
\`\`\`

Available top-level fields: propertyAddress, purchasePrice, caseReference, tenure, stampDuty, legalFees
Available person fields (use personIndex 0-based and personRole): fullName, fundingSource, contributionAmount, employmentStatus, additionalNotes, relationshipToPurchaser

Example for person edit:
\`\`\`json:form-edit
[{"field": "fundingSource", "value": "Savings", "personIndex": 0, "personRole": "Purchaser", "reason": "Confirmed from bank statement"}]
\`\`\`

Always explain what you changed and why BEFORE the edit block.

## ADDING NOTES
When you identify important points, risks, or advice that should be recorded on the case file, output:

\`\`\`text:add-note
AI Assistant noted: [Your observation here with date context]
\`\`\`

IMPORTANT: You are a decision-support tool only. A qualified conveyancer remains responsible for all advice and enquiries.`;

export default function SoWAssistantPanel({
  formContext,
  streamChat,
  onApplyEdits,
  onAddNote,
  collapsed,
  onToggleCollapse,
  caseReference,
}: SoWAssistantPanelProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [docsIncluded, setDocsIncluded] = useState(true);
  const [pendingEdits, setPendingEdits] = useState<FormEditCommand[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const allFiles = useMemo(() => collectAllFiles(formContext), [formContext]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Log a chat exchange to the audit trail
  const logChatToAudit = useCallback(async (userMessage: string, assistantResponse: string) => {
    if (!profile) return;
    try {
      await supabase.from("audit_log").insert({
        case_reference: caseReference || null,
        user_id: profile.user_id,
        user_name: profile.full_name,
        user_email: profile.email,
        user_position: profile.position || "",
        event_type: "sow_ai_chat",
        metadata: {
          user_message: userMessage.slice(0, 2000),
          assistant_response: assistantResponse.slice(0, 4000),
          documents_included: docsIncluded,
          document_count: allFiles.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.error("Failed to log chat to audit:", e);
    }
  }, [profile, caseReference, docsIncluded, allFiles.length]);

  // Process completed AI response for edit commands, notes, and audit
  const processCompletedResponse = useCallback((userText: string, fullResponse: string) => {
    // 1. Parse and apply edit commands
    const edits = parseEditCommands(fullResponse);
    if (edits.length > 0 && onApplyEdits) {
      setPendingEdits(edits);
    }

    // 2. Parse and apply notes
    const notes = parseNoteCommands(fullResponse);
    if (notes.length > 0 && onAddNote) {
      notes.forEach((note) => onAddNote(note));
    }

    // 3. Log entire exchange to audit trail
    logChatToAudit(userText, stripCommandBlocks(fullResponse));
  }, [onApplyEdits, onAddNote, logChatToAudit]);

  const handleApplyEdits = useCallback(() => {
    if (pendingEdits && onApplyEdits) {
      onApplyEdits(pendingEdits);
      toast({ title: "Form updated", description: `${pendingEdits.length} field(s) updated by AI Assistant.` });

      // Log the edit application to audit trail
      if (profile) {
        supabase.from("audit_log").insert({
          case_reference: caseReference || null,
          user_id: profile.user_id,
          user_name: profile.full_name,
          user_email: profile.email,
          user_position: profile.position || "",
          event_type: "sow_ai_form_edit_applied",
          metadata: {
            edits: pendingEdits.map((e) => ({
              field: e.field,
              value: e.value,
              personIndex: e.personIndex,
              personRole: e.personRole,
              reason: e.reason,
            })),
          },
        }).then(({ error: e }) => { if (e) console.error("Audit log error:", e); });
      }
    }
    setPendingEdits(null);
  }, [pendingEdits, onApplyEdits, toast, profile, caseReference]);

  const handleDismissEdits = useCallback(() => {
    // Log that user dismissed AI edits — important for liability
    if (pendingEdits && profile) {
      supabase.from("audit_log").insert({
        case_reference: caseReference || null,
        user_id: profile.user_id,
        user_name: profile.full_name,
        user_email: profile.email,
        user_position: profile.position || "",
        event_type: "sow_ai_form_edit_dismissed",
        metadata: {
          edits_dismissed: pendingEdits.map((e) => ({
            field: e.field,
            value: e.value,
            personIndex: e.personIndex,
            personRole: e.personRole,
            reason: e.reason,
          })),
        },
      }).then(({ error: e }) => { if (e) console.error("Audit log error:", e); });
    }
    setPendingEdits(null);
  }, [pendingEdits, profile, caseReference]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const contextSummary = buildContextSummary(formContext);
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    const apiMessages = [
      { role: "system", content: SYSTEM_CONTEXT },
      { role: "user", content: `[FORM CONTEXT — do not repeat this back to the user]\n${contextSummary}` },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: text },
    ];

    const filesToSend = docsIncluded && allFiles.length > 0
      ? allFiles.map((f) => ({ name: f.name, mimeType: f.mimeType, base64: f.base64 }))
      : undefined;

    let assistantSoFar = "";
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      const visible = stripCommandBlocks(assistantSoFar);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: visible } : m));
        }
        return [...prev, { role: "assistant", content: visible }];
      });
    };

    await streamChat({
      agentId: "source-of-wealth",
      messages: apiMessages,
      files: filesToSend,
      onDelta: upsertAssistant,
      onDone: () => {
        setIsLoading(false);
        processCompletedResponse(text, assistantSoFar);
      },
      onError: (msg) => {
        setIsLoading(false);
        toast({ title: "Assistant error", description: msg, variant: "destructive" });
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${msg}` }]);
        // Still log the failed exchange
        logChatToAudit(text, `[ERROR] ${msg}`);
      },
    });
  }, [input, isLoading, formContext, messages, streamChat, toast, docsIncluded, allFiles, processCompletedResponse, logChatToAudit]);

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
        title="Open AI Assistant"
      >
        <Bot size={18} className="text-accent" />
      </Button>
    );
  }

  return (
    <div className="flex flex-col h-full border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
            <Bot size={14} className="text-accent" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-foreground leading-tight">SoW Assistant</h3>
            <p className="text-[10px] text-muted-foreground">Can edit form & add notes</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleCollapse}>
          <PanelRightClose size={14} />
        </Button>
      </div>

      {/* Document context indicator */}
      {allFiles.length > 0 && (
        <div className="px-3 py-1.5 border-b border-border">
          <button
            onClick={() => setDocsIncluded((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] w-full group"
          >
            <FileText size={12} className={docsIncluded ? "text-accent" : "text-muted-foreground"} />
            <span className={docsIncluded ? "text-foreground" : "text-muted-foreground"}>
              {allFiles.length} doc{allFiles.length !== 1 ? "s" : ""} {docsIncluded ? "included" : "excluded"}
            </span>
            <Badge variant={docsIncluded ? "default" : "secondary"} className="text-[9px] px-1.5 py-0 h-4 ml-auto">
              {docsIncluded ? "ON" : "OFF"}
            </Badge>
          </button>
        </div>
      )}

      {/* Pending edits confirmation */}
      {pendingEdits && pendingEdits.length > 0 && (
        <div className="px-3 py-2 border-b border-border bg-accent/5 space-y-2">
          <div className="flex items-center gap-1.5">
            <Pencil size={12} className="text-accent" />
            <span className="text-[10px] font-semibold text-foreground">AI suggests {pendingEdits.length} edit(s)</span>
          </div>
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {pendingEdits.map((edit, i) => (
              <div key={i} className="text-[10px] text-muted-foreground pl-2 border-l-2 border-accent/30">
                <span className="font-medium text-foreground">{edit.field}</span>
                {edit.personRole && <span> ({edit.personRole} #{(edit.personIndex ?? 0) + 1})</span>}
                : <span className="text-accent">{edit.value}</span>
                {edit.reason && <span className="italic"> — {edit.reason}</span>}
              </div>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" className="h-6 text-[10px] px-2" onClick={handleApplyEdits}>
              <Pencil size={10} className="mr-1" /> Apply
            </Button>
            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={handleDismissEdits}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="px-3 py-2 border-b border-border space-y-1">
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Quick prompts</p>
        <div className="flex flex-wrap gap-1">
          {[
            "Review form for issues",
            "Summarise uploaded documents",
            "Check funding consistency",
            "What documents are missing?",
            "Correct form from documents",
            "Add key points to notes",
          ].map((prompt) => (
            <button
              key={prompt}
              className="text-[10px] px-2 py-1 rounded-full border border-border hover:bg-accent/10 hover:border-accent/30 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => { setInput(prompt); }}
              disabled={isLoading}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mb-3">
              <Sparkles size={18} className="text-accent" />
            </div>
            <p className="text-xs font-medium text-foreground mb-1">AI Assistant Ready</p>
            <p className="text-[10px] text-muted-foreground max-w-[200px]">
              {allFiles.length > 0
                ? `${allFiles.length} document${allFiles.length !== 1 ? "s" : ""} loaded. Ask questions, get form corrections, or add notes to the case.`
                : "Upload documents to ask questions, get form corrections, or add notes to the case."}
            </p>
            <div className="flex gap-2 mt-3">
              <Badge variant="outline" className="text-[9px] gap-1">
                <Pencil size={8} /> Edits form
              </Badge>
              <Badge variant="outline" className="text-[9px] gap-1">
                <StickyNote size={8} /> Adds notes
              </Badge>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[90%] rounded-lg px-2.5 py-2 text-xs ${
                    msg.role === "user"
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted border border-border"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-xs max-w-none dark:prose-invert [&_p]:text-xs [&_li]:text-xs [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs">
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
      <div className="px-3 py-2 border-t border-border">
        <div className="flex gap-1.5">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about docs, request edits…"
            className="min-h-[36px] max-h-[80px] text-xs resize-none"
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="shrink-0 self-end h-8 w-8"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </Button>
        </div>
        <p className="text-[9px] text-muted-foreground mt-1 italic">
          All conversations are logged to the audit trail. Decision-support only.
        </p>
      </div>
    </div>
  );
}
