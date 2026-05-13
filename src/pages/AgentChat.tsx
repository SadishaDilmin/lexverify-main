import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, Navigate, useSearchParams } from "react-router-dom";
import SoWFormUI from "@/components/SoWFormUI";
import { useAgentPrefill } from "@/hooks/useAgentPrefill";

import { motion } from "framer-motion";
import { ArrowLeft, Send, Loader2, AlertCircle, Bot, User, Paperclip, Archive, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import CreditBadge from "@/components/CreditBadge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AppLayout from "@/components/AppLayout";
import { getAgentById } from "@/config/agents";
import type { FormFieldConfig } from "@/config/agents";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/hooks/use-toast";
import CaseBanner from "@/components/CaseBanner";
import {
  type AttachedFile,
  useMultiFileAttachment,
  AttachedFilesBar,
  DropZoneOverlay,
  FileChip,
} from "@/components/AgentChatFileAttachment";
import { streamChat } from "@/lib/streamChat";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import ClientPortalManager from "@/components/case-workspace/ClientPortalManager";
import FollowUpReminderPanel from "@/components/case-workspace/FollowUpReminderPanel";
import AuditTrailExport from "@/components/case-workspace/AuditTrailExport";
import CaseArchiveExport from "@/components/case-workspace/CaseArchiveExport";

// Re-export for backward compatibility with any external imports
export { streamChat } from "@/lib/streamChat";

type Msg = { role: "user" | "assistant"; content: string };

// ── Form-based agent UI ────────────────────────────────────────────────
function AgentFormUI({
  agentId,
  fields,
  agentName,
}: {
  agentId: string;
  fields: FormFieldConfig[];
  agentName: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [result, setResult] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const { attachedFiles, fileInputRef, handleFileSelect, removeFile, clearFiles, processFiles } = useMultiFileAttachment();
  const { prefillData } = useAgentPrefill();

  const handleChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const field of fields) {
      if (field.required && !formData[field.name]?.trim()) {
        toast({ title: "Required field", description: `Please fill in ${field.label}.`, variant: "destructive" });
        return;
      }
    }
    // Inject profile context + form fields
    const profileLine = prefillData.fullName
      ? `**Conveyancer:** ${prefillData.fullName} (${prefillData.position || "Conveyancer"}) — ${prefillData.firmName || "Firm not set"}\n\n`
      : "";
    const caseLine = prefillData.caseReference
      ? `**Linked Case:** ${prefillData.caseReference} — ${prefillData.propertyAddress}\n\n`
      : "";
    const fieldLines = fields
      .map((f) => `**${f.label}:** ${formData[f.name] || "Not provided"}`)
      .join("\n\n");
    const userMessage = profileLine + caseLine + fieldLines;
    setIsLoading(true);
    setResult("");
    let accumulated = "";
    await streamChat({
      agentId,
      messages: [{ role: "user", content: userMessage }],
      files: attachedFiles.length > 0 ? attachedFiles : undefined,
      onDelta: (chunk) => { accumulated += chunk; setResult(accumulated); },
      onDone: () => { setIsLoading(false); clearFiles(); queryClient.invalidateQueries({ queryKey: ["user-credits"] }); },
      onError: (msg) => { setIsLoading(false); toast({ title: "Error", description: msg, variant: "destructive" }); },
    });
  };

  const handleFormDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }, []);
  const handleFormDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragging(false); }
  }, []);
  const handleFormDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleFormDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current = 0; setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files?.length) await processFiles(files);
  }, [processFiles]);

  return (
    <div
      className="grid lg:grid-cols-2 gap-6 h-full relative"
      onDragEnter={handleFormDragEnter}
      onDragLeave={handleFormDragLeave}
      onDragOver={handleFormDragOver}
      onDrop={handleFormDrop}
    >
      <DropZoneOverlay visible={isDragging} />
      <Card className="border-border">
        <CardHeader className="pb-3">
          <h2 className="text-base font-semibold text-foreground">Input</h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">

            {fields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <Label htmlFor={field.name} className="text-sm">
                  {field.label} {field.required && <span className="text-destructive">*</span>}
                </Label>
                {field.type === "textarea" ? (
                  <Textarea
                    id={field.name}
                    placeholder={field.placeholder}
                    value={formData[field.name] || ""}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    className="min-h-[120px] resize-none"
                    maxLength={10000}
                  />
                ) : field.type === "select" && field.options ? (
                  <Select value={formData[field.name] || ""} onValueChange={(v) => handleChange(field.name, v)}>
                    <SelectTrigger><SelectValue placeholder={`Select ${field.label.toLowerCase()}…`} /></SelectTrigger>
                    <SelectContent>
                      {field.options.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={field.name}
                    placeholder={field.placeholder}
                    value={formData[field.name] || ""}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    maxLength={500}
                  />
                )}
              </div>
            ))}

            {/* File attachment */}
            <div className="space-y-1.5">
              <Label className="text-sm">Attach Documents (optional)</Label>
              <AttachedFilesBar files={attachedFiles} onRemove={removeFile} disabled={isLoading} />
              <div>
                <input ref={fileInputRef} type="file" accept=".pdf,.txt,.csv,.md,.doc,.docx,.jpg,.jpeg,.png,.tif,.tiff,.bmp,.webp,.heic,.eml,.msg,.dwg,.dxf,.xls,.xlsx,.rtf" multiple onChange={handleFileSelect} className="hidden" />
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isLoading} className="gap-1.5">
                  <Paperclip size={14} /> Upload Files
                </Button>
                <p className="text-xs text-muted-foreground mt-1">Drag &amp; drop or click to attach PDF, Word, images, Excel, emails, plans — max 10MB each, up to 50 files</p>
              </div>
            </div>

            <Button type="submit" disabled={isLoading} className="bg-accent text-accent-foreground hover:bg-accent/90 w-full">
              {isLoading ? (<><Loader2 size={16} className="animate-spin mr-2" />Analysing…</>) : (<><Send size={16} className="mr-2" />Analyse</>)}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-3"><h2 className="text-base font-semibold text-foreground">Analysis</h2></CardHeader>
        <CardContent>
          {result ? (
            <div className="prose prose-sm dark:prose-invert max-w-none agent-output"><ReactMarkdown>{result}</ReactMarkdown></div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <Bot size={32} className="mb-3 opacity-40" />
              <p className="text-sm">Submit the form to see the analysis here.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Chat-based agent UI ────────────────────────────────────────────────
function AgentChatUI({ agentId, agentName }: { agentId: string; agentName: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const agent = getAgentById(agentId)!;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);
  const { attachedFiles, fileInputRef, handleFileSelect, removeFile, clearFiles, processFiles } = useMultiFileAttachment();
  const { prefillData } = useAgentPrefill();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // ── Drag & drop handlers ──────────────────────────────────────────
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer?.types.includes("Files")) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragging(false); }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);
      const droppedFiles = e.dataTransfer?.files;
      if (droppedFiles && droppedFiles.length > 0) {
        await processFiles(droppedFiles);
      }
    },
    [processFiles]
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && attachedFiles.length === 0) || isLoading) return;

    const fileNames = attachedFiles.map((f) => f.name);
    const displayContent = attachedFiles.length > 0
      ? `${text || "Please analyse the attached documents."}\n\n📎 ${fileNames.join(", ")}`
      : text;
    // Inject profile context on first message
    const profileCtx = messages.length === 0 && prefillData.fullName
      ? `[Context: Conveyancer ${prefillData.fullName}, ${prefillData.position || "Conveyancer"}, ${prefillData.firmName || "firm not set"}]\n\n`
      : "";
    const messageContent = profileCtx + (text || "Please analyse the attached documents and categorise each one by document type before proceeding with the analysis.");

    const userMsg: Msg = { role: "user", content: displayContent };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    const currentFiles = [...attachedFiles];
    clearFiles();

    let assistantSoFar = "";
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    const apiMessages = [...messages, { role: "user" as const, content: messageContent }];

    await streamChat({
      agentId,
      messages: apiMessages,
      files: currentFiles.length > 0 ? currentFiles : undefined,
      onDelta: upsertAssistant,
      onDone: () => { setIsLoading(false); queryClient.invalidateQueries({ queryKey: ["user-credits"] }); },
      onError: (msg) => {
        setIsLoading(false);
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    });
  }, [input, isLoading, agentId, messages, toast, attachedFiles, clearFiles]);

  return (
    <div
      ref={dropRef}
      className="flex flex-col h-full relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <DropZoneOverlay visible={isDragging} />

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-16 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
              <agent.icon size={28} className="text-accent" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Start a conversation</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Ask me anything about {agentName.toLowerCase()}. You can also drag &amp; drop documents for analysis.
            </p>
          </motion.div>
        )}

        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-1">
                <Bot size={16} className="text-accent" />
              </div>
            )}
            <Card
              className={`max-w-[75%] px-4 py-3 ${
                msg.role === "user"
                  ? "bg-accent text-accent-foreground border-accent"
                  : "bg-card border-border"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none text-sm agent-output">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              )}
            </Card>
            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-1">
                <User size={16} className="text-muted-foreground" />
              </div>
            )}
          </motion.div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <Bot size={16} className="text-accent" />
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 size={14} className="animate-spin" />
              Thinking…
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border pt-4">
        <AttachedFilesBar files={attachedFiles} onRemove={removeFile} disabled={isLoading} />
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" accept=".pdf,.txt,.csv,.md,.doc,.docx,.jpg,.jpeg,.png,.tif,.tiff,.bmp,.webp,.heic,.eml,.msg,.dwg,.dxf,.xls,.xlsx,.rtf" multiple onChange={handleFileSelect} className="hidden" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="shrink-0 self-end text-muted-foreground hover:text-accent"
            title="Attach documents"
          >
            <Paperclip size={18} />
          </Button>
          <Textarea
            placeholder={`Ask ${agentName}… or drag & drop documents`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            className="resize-none min-h-[44px] max-h-32"
            rows={1}
            disabled={isLoading}
          />
          <Button
            onClick={send}
            disabled={(!input.trim() && attachedFiles.length === 0) || isLoading}
            className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0 self-end"
            size="icon"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 ml-11">
          Drag &amp; drop or click 📎 to attach PDF, Word, images, Excel, emails, or plans (up to 15 files)
        </p>
      </div>
    </div>
  );
}

// ── Main agent workspace page ──────────────────────────────────────────
const AgentChat = () => {
  const { agentId } = useParams<{ agentId: string }>();
  const [searchParams] = useSearchParams();
  const caseIdFromUrl = searchParams.get("caseId");
  const { toast } = useToast();
  const { prefillData } = useAgentPrefill();
  const agent = agentId ? getAgentById(agentId) : undefined;
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: caseData } = useQuery({
    queryKey: ["case", caseIdFromUrl],
    queryFn: async () => {
      if (!caseIdFromUrl) return null;
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .eq("id", caseIdFromUrl)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!caseIdFromUrl,
  });

  // Redirect to dashboard if no caseId is provided
  useEffect(() => {
    if (!caseIdFromUrl) {
      toast({ title: "No case selected", description: "Please select a case from your dashboard first.", variant: "destructive" });
    }
  }, [caseIdFromUrl]);

  if (!agent || !caseIdFromUrl) return <Navigate to="/dashboard" replace />;

  if (!agent.available) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <agent.icon size={48} className="text-muted-foreground/40 mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">{agent.name}</h2>
          <p className="text-muted-foreground mb-4">This agent is coming soon. Join the Priority Access list to be notified.</p>
        </div>
      </AppLayout>
    );
  }

  const isSoW = agent.id === "source-of-wealth";
  const isForm = !isSoW && agent.interactionType === "form" && agent.formFields;

  return (
    <AppLayout contentWidth={isSoW ? "full" : "default"}>
      <div className={`flex flex-col ${isForm ? "min-h-[calc(100vh-6rem)]" : "h-[calc(100vh-6rem)]"}`}>
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-border mb-4">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link to="/dashboard"><ArrowLeft size={18} /></Link>
          </Button>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
              <agent.icon size={18} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-foreground leading-tight">{agent.name}</h1>
              <p className="text-xs text-muted-foreground">{agent.description.slice(0, 80)}…</p>
            </div>
          </div>
          <CreditBadge />
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
                <Settings2 size={14} />
                Case Management
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[420px] sm:w-[480px] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Case Management</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 p-1 mt-4">
                {user && (
                  <ClientPortalManager
                    caseId={caseIdFromUrl!}
                    caseReference={prefillData.caseReference || ""}
                    userId={user.id}
                  />
                )}
                {user && (
                  <FollowUpReminderPanel
                    caseId={caseIdFromUrl!}
                    userId={user.id}
                  />
                )}
                <AuditTrailExport
                  caseId={caseIdFromUrl!}
                  caseReference={prefillData.caseReference || ""}
                />
                {caseData && (
                  <CaseArchiveExport
                    caseId={caseIdFromUrl!}
                    caseReference={prefillData.caseReference || ""}
                    caseData={caseData}
                  />
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5 border-accent/30 hover:bg-accent/10 hover:text-accent"
                      disabled={caseData?.status === "completed"}
                    >
                      <Archive size={14} />
                      {caseData?.status === "completed" ? "Case Completed" : "Complete & Archive Case"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Complete this case?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will mark <strong>{prefillData.caseReference}</strong> as completed
                        and move it to Archived Cases. You can still view the case but no further
                        changes will be expected.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-accent text-accent-foreground hover:bg-accent/90"
                        onClick={async () => {
                          const { error } = await supabase
                            .from("cases")
                            .update({ status: "completed" })
                            .eq("id", caseIdFromUrl!);
                          if (error) {
                            toast({ title: "Error", description: error.message, variant: "destructive" });
                          } else {
                            toast({ title: "Case completed", description: `${prefillData.caseReference} has been archived.` });
                            queryClient.invalidateQueries({ queryKey: ["case", caseIdFromUrl] });
                          }
                        }}
                      >
                        Complete &amp; Archive
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </SheetContent>
          </Sheet>
        </div>
        {!isSoW && (
          <CaseBanner
            caseReference={prefillData.caseReference}
            propertyAddress={prefillData.propertyAddress}
          />
        )}

        {/* Content */}
        <div className="flex-1">
          {isSoW ? (
            <SoWFormUI agentId={agentId!} agentName={agent.name} streamChat={streamChat} />
          ) : isForm ? (
            <AgentFormUI agentId={agentId!} fields={agent.formFields!} agentName={agent.name} />
          ) : (
            <AgentChatUI agentId={agentId!} agentName={agent.name} />
          )}
        </div>

        {/* Disclaimer */}
        <p className="text-[11px] text-muted-foreground mt-4 flex items-center gap-1">
          <AlertCircle size={11} />
          AI outputs are professional assistance tools — not legal advice. Always exercise independent judgement.
        </p>
      </div>
    </AppLayout>
  );
};

export default AgentChat;
