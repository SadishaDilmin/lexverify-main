import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Loader2, Sparkles, FileText, ExternalLink, BrainCircuit, Film, Headphones } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useClickableTimestamps } from "@/hooks/useClickableTimestamps";

interface SearchResult {
  id: string;
  file_name: string;
  file_path: string;
  bucket: string;
  chunk_index: number;
  similarity: number;
  snippet: string;
  metadata: Record<string, any> | null;
}

export interface MediaClip {
  url: string;
  type: "audio" | "video";
  seekTime: number;
  fileName: string;
}

interface Props {
  caseId?: string;
  onMediaClip?: (clip: MediaClip) => void;
}

const MEDIA_TYPES = new Set(["audio", "video"]);

function getFileMediaType(metadata: Record<string, any> | null, fileName: string): "audio" | "video" | null {
  const mimeType = metadata?.mime_type ?? "";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "ogg", "flac", "aac"].includes(ext)) return "audio";
  return null;
}

const KnowledgeBaseSearch = ({ caseId, onMediaClip }: Props) => {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const handleSeek = useCallback(
    (seconds: number, result: SearchResult) => {
      if (!onMediaClip) return;
      const mediaType = getFileMediaType(result.metadata, result.file_name);
      if (!mediaType) return;

      // Build authenticated storage URL
      const cleanPath = result.file_path.replace(/#chunk\d+$/, "");
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/storage/v1/object/authenticated/${result.bucket}/${cleanPath}`;

      onMediaClip({ url, type: mediaType, seekTime: seconds, fileName: result.file_name });
    },
    [onMediaClip]
  );

  const handleSearch = useCallback(async () => {
    if (!query.trim() || searching) return;
    setSearching(true);
    setSummary(null);
    setResults(null);

    try {
      const { data, error } = await supabase.functions.invoke("search-knowledge-base", {
        body: { query: query.trim(), case_id: caseId || null, top_k: 5, threshold: 0.35 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResults(data.results || []);
      setSummary(data.summary || null);
    } catch (e: any) {
      console.error("KB search error:", e);
      setResults([]);
      setSummary("Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }, [query, searching, caseId]);

  const getStorageUrl = (bucket: string, filePath: string) => {
    const cleanPath = filePath.replace(/#chunk\d+$/, "");
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    return `https://${projectId}.supabase.co/storage/v1/object/authenticated/${bucket}/${cleanPath}`;
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BrainCircuit size={16} className="text-accent" />
          Ask the Knowledge Base
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Search input */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Sparkles size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-accent" />
            <Input
              placeholder="e.g. 'What are the drainage search results?'"
              className="pl-9 h-9 text-xs"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <Button size="sm" onClick={handleSearch} disabled={!query.trim() || searching} className="gap-1 h-9 text-xs">
            {searching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            Search
          </Button>
        </div>

        {/* Results */}
        {results !== null && (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-3">
              {/* AI Summary */}
              {summary && (
                <SummaryWithTimestamps
                  summary={summary}
                  results={results}
                  onMediaClip={onMediaClip ? handleSeek : undefined}
                />
              )}

              {/* Source documents */}
              {results.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No matching documents found.</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Sources ({results.length})
                  </p>
                  {results.map((r) => (
                    <SourceCard
                      key={r.id}
                      result={r}
                      getStorageUrl={getStorageUrl}
                      onMediaClip={onMediaClip ? handleSeek : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

/** AI summary section with clickable timestamps pointing to first media result */
function SummaryWithTimestamps({
  summary,
  results,
  onMediaClip,
}: {
  summary: string;
  results: SearchResult[];
  onMediaClip?: (seconds: number, result: SearchResult) => void;
}) {
  // Find the first media result to link timestamps against
  const mediaResult = results.find((r) => getFileMediaType(r.metadata, r.file_name) !== null);

  const { renderWithTimestamps } = useClickableTimestamps({
    onSeek: (seconds) => {
      if (mediaResult && onMediaClip) onMediaClip(seconds, mediaResult);
    },
  });

  return (
    <div className="p-3 rounded-lg bg-accent/10 border border-accent/20">
      <p className="text-[10px] font-semibold text-accent mb-1 flex items-center gap-1">
        <Sparkles size={10} /> AI Answer
      </p>
      <div className="text-xs text-foreground prose prose-sm max-w-none">
        {mediaResult && onMediaClip ? (
          <TimestampMarkdown text={summary} onSeek={(s) => onMediaClip(s, mediaResult)} />
        ) : (
          <ReactMarkdown>{summary}</ReactMarkdown>
        )}
      </div>
    </div>
  );
}

/** Renders markdown but injects clickable timestamps into text nodes */
function TimestampMarkdown({ text, onSeek }: { text: string; onSeek: (seconds: number) => void }) {
  const { renderWithTimestamps } = useClickableTimestamps({ onSeek });

  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p>{processChildren(children, renderWithTimestamps)}</p>,
        li: ({ children }) => <li>{processChildren(children, renderWithTimestamps)}</li>,
        td: ({ children }) => <td>{processChildren(children, renderWithTimestamps)}</td>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

/** Process React children, replacing string nodes with timestamp-parsed nodes */
function processChildren(
  children: React.ReactNode,
  renderFn: (text: string) => React.ReactNode[]
): React.ReactNode {
  if (!children) return children;
  if (typeof children === "string") return <>{renderFn(children)}</>;
  if (Array.isArray(children)) {
    return children.map((child, i) =>
      typeof child === "string" ? <span key={i}>{renderFn(child)}</span> : child
    );
  }
  return children;
}

/** Individual source card with optional media timestamp support */
function SourceCard({
  result,
  getStorageUrl,
  onMediaClip,
}: {
  result: SearchResult;
  getStorageUrl: (bucket: string, path: string) => string;
  onMediaClip?: (seconds: number, result: SearchResult) => void;
}) {
  const mediaType = getFileMediaType(result.metadata, result.file_name);
  const isMedia = mediaType !== null;

  const { renderWithTimestamps } = useClickableTimestamps({
    onSeek: (seconds) => {
      if (onMediaClip) onMediaClip(seconds, result);
    },
  });

  return (
    <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40 hover:border-accent/30 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {isMedia ? (
            mediaType === "video" ? (
              <Film size={12} className="text-primary shrink-0" />
            ) : (
              <Headphones size={12} className="text-primary shrink-0" />
            )
          ) : (
            <FileText size={12} className="text-muted-foreground shrink-0" />
          )}
          <span className="text-xs font-medium truncate">{result.file_name}</span>
          {isMedia && (
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 shrink-0">
              {mediaType}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="outline" className="text-[9px] px-1.5 py-0">
            {Math.round(result.similarity * 100)}% match
          </Badge>
          {result.chunk_index > 0 && (
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
              §{result.chunk_index + 1}
            </Badge>
          )}
          <a
            href={getStorageUrl(result.bucket, result.file_path)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-accent"
          >
            <ExternalLink size={10} />
          </a>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-3">
        {isMedia && onMediaClip ? renderWithTimestamps(result.snippet) : result.snippet}
      </p>
    </div>
  );
}

export default KnowledgeBaseSearch;
