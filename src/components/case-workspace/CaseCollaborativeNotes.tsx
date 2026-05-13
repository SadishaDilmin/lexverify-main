import { useState, useEffect, useCallback } from "react";
import { MessageSquare, Send, Pin, Trash2, Reply, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface CaseCollaborativeNotesProps {
  caseId: string;
  userName: string;
  userPosition: string;
  userId: string;
}

interface NoteRow {
  id: string;
  case_id: string;
  parent_id: string | null;
  user_id: string;
  user_name: string;
  user_position: string;
  content: string;
  pinned: boolean;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
  updated_at: string;
}

export default function CaseCollaborativeNotes({ caseId, userName, userPosition, userId }: CaseCollaborativeNotesProps) {
  const [newNote, setNewNote] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["case_notes", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_notes")
        .select("*")
        .eq("case_id", caseId)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as NoteRow[];
    },
    enabled: !!caseId,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`case-notes-${caseId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "case_notes", filter: `case_id=eq.${caseId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["case_notes", caseId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [caseId, queryClient]);

  const handleSubmit = useCallback(async () => {
    if (!newNote.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("case_notes").insert({
        case_id: caseId,
        user_id: userId,
        user_name: userName,
        user_position: userPosition,
        content: newNote.trim(),
        parent_id: replyingTo,
      });
      if (error) throw error;
      setNewNote("");
      setReplyingTo(null);
      queryClient.invalidateQueries({ queryKey: ["case_notes", caseId] });
    } catch (e: any) {
      toast({ title: "Failed to add note", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }, [caseId, newNote, replyingTo, userId, userName, userPosition, queryClient, toast]);

  const handlePin = async (noteId: string, pinned: boolean) => {
    await supabase.from("case_notes").update({ pinned: !pinned }).eq("id", noteId);
    queryClient.invalidateQueries({ queryKey: ["case_notes", caseId] });
  };

  const handleDelete = async (noteId: string) => {
    await supabase.from("case_notes").delete().eq("id", noteId);
    queryClient.invalidateQueries({ queryKey: ["case_notes", caseId] });
  };

  // Build threaded structure
  const topLevel = notes.filter((n) => !n.parent_id);
  const replies = notes.filter((n) => n.parent_id);
  const replyMap = new Map<string, NoteRow[]>();
  for (const r of replies) {
    const arr = replyMap.get(r.parent_id!) || [];
    arr.push(r);
    replyMap.set(r.parent_id!, arr);
  }

  const formatTime = (d: string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const renderNote = (note: NoteRow, isReply = false) => (
    <div key={note.id} className={`group px-3 py-2 rounded-lg border transition-colors ${isReply ? "ml-6 border-border/50 bg-muted/20" : note.pinned ? "border-accent/30 bg-accent/5" : "border-border bg-background hover:bg-muted/30"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-foreground">{note.user_name}</span>
            <Badge variant="secondary" className="text-[8px] h-3.5 px-1">{note.user_position}</Badge>
            {note.pinned && <Pin size={9} className="text-accent" />}
            <span className="text-[9px] text-muted-foreground">{formatTime(note.created_at)}</span>
          </div>
          <p className="text-[11px] text-foreground/90 mt-1 whitespace-pre-wrap">{note.content}</p>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isReply && (
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setReplyingTo(note.id)}>
              <Reply size={10} />
            </Button>
          )}
          {note.user_id === userId && (
            <>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handlePin(note.id, note.pinned)}>
                <Pin size={10} className={note.pinned ? "text-accent" : ""} />
              </Button>
              <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive/60 hover:text-destructive" onClick={() => handleDelete(note.id)}>
                <Trash2 size={10} />
              </Button>
            </>
          )}
        </div>
      </div>
      {/* Replies */}
      {replyMap.get(note.id)?.map((r) => renderNote(r, true))}
    </div>
  );

  const replyTarget = replyingTo ? notes.find((n) => n.id === replyingTo) : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageSquare size={14} className="text-accent" />
          Case Notes
          {notes.length > 0 && <Badge variant="secondary" className="text-[9px] h-4">{notes.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : topLevel.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-3">No notes yet. Add the first note below.</p>
        ) : (
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
            {topLevel.map((n) => renderNote(n))}
          </div>
        )}

        {/* New note input */}
        <div className="pt-2 border-t border-border space-y-1.5">
          {replyTarget && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground bg-muted/30 px-2 py-1 rounded">
              <Reply size={10} />
              <span>Replying to <strong>{replyTarget.user_name}</strong></span>
              <Button variant="ghost" size="icon" className="h-4 w-4 ml-auto" onClick={() => setReplyingTo(null)}>×</Button>
            </div>
          )}
          <div className="flex gap-2">
            <Textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a note…"
              className="text-[11px] min-h-[32px] h-8 resize-none"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            />
            <Button
              size="icon"
              className="h-8 w-8 shrink-0 bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={!newNote.trim() || submitting}
              onClick={handleSubmit}
            >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
