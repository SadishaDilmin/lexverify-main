import { useState, useMemo } from "react";
import DOMPurify from "dompurify";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Mail, RefreshCw, Search, Paperclip, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

interface CaseCorrespondenceTabProps {
  caseId: string;
  hoowlaMatterId: string | null;
}

interface Correspondence {
  id: string;
  hoowla_message_id: string;
  subject: string;
  from_name: string | null;
  from_email: string | null;
  to_recipients: { name: string; email: string }[];
  cc_recipients: { name: string; email: string }[];
  bcc_recipients: { name: string; email: string }[];
  attachments: { title: string; document_id: number | null; inline: boolean }[];
  html_content: string | null;
  sent_at: string | null;
  synced_at: string;
}

const SanitizedEmailBody = ({ html }: { html: string }) => {
  const clean = useMemo(
    () =>
      DOMPurify.sanitize(html, {
        FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
        FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
      }),
    [html]
  );
  return (
    <div
      className="flex-1 overflow-auto bg-background rounded border p-4 text-sm"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
};

const CaseCorrespondenceTab = ({ caseId, hoowlaMatterId }: CaseCorrespondenceTabProps) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewContent, setViewContent] = useState<Correspondence | null>(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["case_correspondence", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_correspondence")
        .select("*")
        .eq("case_id", caseId)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Correspondence[]) ?? [];
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!hoowlaMatterId) throw new Error("No Hoowla matter ID linked to this case");
      const { data, error } = await supabase.functions.invoke("sync-hoowla-messages", {
        body: { matter_id: hoowlaMatterId, case_id: caseId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["case_correspondence", caseId] });
      toast.success(`Synced ${data.synced} message${data.synced !== 1 ? "s" : ""} from Hoowla`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to sync messages");
    },
  });

  const filtered = messages.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.subject.toLowerCase().includes(q) ||
      (m.from_name || "").toLowerCase().includes(q) ||
      (m.from_email || "").toLowerCase().includes(q)
    );
  });

  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatRecipients = (recipients: { name: string; email: string }[]) => {
    if (!recipients?.length) return "—";
    return recipients.map((r) => r.name || r.email).join(", ");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input
            placeholder="Search correspondence…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {messages.length} message{messages.length !== 1 ? "s" : ""}
          </Badge>
          {hoowlaMatterId && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Sync from Hoowla
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-muted-foreground" size={24} />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail size={40} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">
              {messages.length === 0
                ? "No correspondence synced yet."
                : "No messages match your search."}
            </p>
            {messages.length === 0 && hoowlaMatterId && (
              <p className="text-sm text-muted-foreground mt-1">
                Click "Sync from Hoowla" to pull emails and correspondence from this case.
              </p>
            )}
            {!hoowlaMatterId && (
              <p className="text-sm text-muted-foreground mt-1">
                This case is not linked to a Hoowla matter. Create the case via CMS import to enable correspondence sync.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((msg) => {
            const isExpanded = expandedId === msg.id;
            return (
              <Card
                key={msg.id}
                className="cursor-pointer hover:border-accent/30 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : msg.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Mail size={14} className="text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm text-foreground truncate">
                          {msg.subject || "(No subject)"}
                        </span>
                        {msg.attachments?.length > 0 && (
                          <Badge variant="outline" className="text-[10px] gap-0.5 shrink-0">
                            <Paperclip size={10} />
                            {msg.attachments.length}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          From: <span className="text-foreground">{msg.from_name || msg.from_email || "Unknown"}</span>
                        </span>
                        <span>To: {formatRecipients(msg.to_recipients)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">{formatDate(msg.sent_at)}</span>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border space-y-2">
                      {msg.cc_recipients?.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          CC: {formatRecipients(msg.cc_recipients)}
                        </p>
                      )}
                      {msg.attachments?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {msg.attachments.map((att, i) => (
                            <Badge key={i} variant="secondary" className="text-[11px] gap-1">
                              <Paperclip size={10} /> {att.title}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {msg.html_content && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewContent(msg);
                          }}
                        >
                          View Email Content
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Email content viewer dialog */}
      <Dialog open={!!viewContent} onOpenChange={() => setViewContent(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">{viewContent?.subject || "Email"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-xs text-muted-foreground border-b pb-2">
            <p>From: <span className="text-foreground">{viewContent?.from_name} ({viewContent?.from_email})</span></p>
            <p>To: {formatRecipients(viewContent?.to_recipients || [])}</p>
            {(viewContent?.cc_recipients?.length ?? 0) > 0 && (
              <p>CC: {formatRecipients(viewContent?.cc_recipients || [])}</p>
            )}
            <p>Date: {formatDate(viewContent?.sent_at ?? null)}</p>
          </div>
          <SanitizedEmailBody html={viewContent?.html_content || ""} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CaseCorrespondenceTab;
