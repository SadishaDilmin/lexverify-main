import { useState, useEffect, useRef, useCallback } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { articles } from "@/data/articles";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Headphones, Trash2, RefreshCw, CheckCircle2, XCircle, Loader2, Play, Pause, Zap, StopCircle } from "lucide-react";

interface CachedAudioInfo {
  slug: string;
  title: string;
  category: string;
  cached: boolean;
  publicUrl?: string;
  loading?: boolean;
}

const AdminArticleAudio = () => {
  const [audioMap, setAudioMap] = useState<CachedAudioInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [playingSlug, setPlayingSlug] = useState<string | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  // Bulk generation state
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0, currentSlug: "" });
  const abortRef = useRef(false);

  const checkCache = async () => {
    setLoading(true);
    const results: CachedAudioInfo[] = [];

    for (const article of articles) {
      const { data } = supabase.storage
        .from("article-audio")
        .getPublicUrl(`${article.slug}.mp3`);

      // Try a HEAD request to check existence
      try {
        const res = await fetch(data.publicUrl, { method: "HEAD" });
        results.push({
          slug: article.slug,
          title: article.title,
          category: article.category,
          cached: res.ok && (res.headers.get("content-type")?.includes("audio") || res.headers.get("content-length") !== "0"),
          publicUrl: res.ok ? data.publicUrl : undefined,
        });
      } catch {
        results.push({
          slug: article.slug,
          title: article.title,
          category: article.category,
          cached: false,
        });
      }
    }

    setAudioMap(results);
    setLoading(false);
  };

  useEffect(() => {
    checkCache();
  }, []);

  const handleDelete = async (slug: string) => {
    setDeletingSlug(slug);
    try {
      const { error } = await supabase.storage
        .from("article-audio")
        .remove([`${slug}.mp3`]);

      if (error) throw error;

      setAudioMap((prev) =>
        prev.map((a) => (a.slug === slug ? { ...a, cached: false, publicUrl: undefined } : a))
      );
      toast.success(`Cache cleared for "${slug}". Next listen will regenerate.`);
    } catch (e) {
      toast.error(`Failed to delete: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setDeletingSlug(null);
    }
  };

  const handleDeleteAll = async () => {
    const cachedSlugs = audioMap.filter((a) => a.cached).map((a) => `${a.slug}.mp3`);
    if (cachedSlugs.length === 0) return;

    setLoading(true);
    try {
      const { error } = await supabase.storage
        .from("article-audio")
        .remove(cachedSlugs);

      if (error) throw error;
      toast.success(`Cleared ${cachedSlugs.length} cached audio files.`);
      await checkCache();
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "Unknown error"}`);
      setLoading(false);
    }
  };

  const togglePlay = (slug: string, url?: string) => {
    if (playingSlug === slug && audioEl) {
      audioEl.pause();
      setPlayingSlug(null);
      setAudioEl(null);
      return;
    }

    if (audioEl) {
      audioEl.pause();
    }

    if (!url) return;
    const audio = new Audio(url);
    audio.play();
    audio.addEventListener("ended", () => {
      setPlayingSlug(null);
      setAudioEl(null);
    });
    setPlayingSlug(slug);
    setAudioEl(audio);
  };

  const handleBulkGenerate = useCallback(async () => {
    const uncached = audioMap.filter((a) => !a.cached);
    if (uncached.length === 0) {
      toast.info("All articles already have cached audio.");
      return;
    }

    setGenerating(true);
    abortRef.current = false;
    setGenProgress({ current: 0, total: uncached.length, currentSlug: "" });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < uncached.length; i++) {
      if (abortRef.current) break;

      const item = uncached[i];
      const article = articles.find((a) => a.slug === item.slug);
      if (!article) continue;

      setGenProgress({ current: i + 1, total: uncached.length, currentSlug: item.slug });

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/article-tts`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              text: `${article.title}\n\n${article.body}`,
              slug: article.slug,
            }),
          }
        );

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Failed" }));
          console.error(`Failed to generate audio for ${item.slug}:`, err);
          failCount++;
        } else {
          successCount++;
          // Update local state to show as cached
          setAudioMap((prev) =>
            prev.map((a) => {
              if (a.slug !== item.slug) return a;
              const { data } = supabase.storage.from("article-audio").getPublicUrl(`${item.slug}.mp3`);
              return { ...a, cached: true, publicUrl: data.publicUrl };
            })
          );
        }
      } catch (e) {
        console.error(`Error generating ${item.slug}:`, e);
        failCount++;
      }
    }

    setGenerating(false);

    if (abortRef.current) {
      toast.info(`Bulk generation stopped. Generated ${successCount} of ${uncached.length}.`);
    } else if (failCount > 0) {
      toast.warning(`Done: ${successCount} generated, ${failCount} failed.`);
    } else {
      toast.success(`All ${successCount} articles generated successfully!`);
    }
  }, [audioMap]);

  const handleStopGenerate = () => {
    abortRef.current = true;
  };

  const cachedCount = audioMap.filter((a) => a.cached).length;
  const totalCount = audioMap.length;
  const uncachedCount = totalCount - cachedCount;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Headphones size={24} /> Article Audio Cache
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage cached TTS audio for insight articles. Cached audio saves ElevenLabs credits.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={checkCache} disabled={loading || generating} className="gap-1.5">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            {generating ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleStopGenerate}
                className="gap-1.5 border-destructive text-destructive hover:bg-destructive/10"
              >
                <StopCircle size={14} /> Stop
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleBulkGenerate}
                disabled={loading || uncachedCount === 0}
                className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <Zap size={14} /> Generate All ({uncachedCount})
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteAll}
              disabled={loading || generating || cachedCount === 0}
              className="gap-1.5"
            >
              <Trash2 size={14} /> Clear All ({cachedCount})
            </Button>
          </div>
        </div>

        {/* Bulk generation progress */}
        {generating && (
          <Card className="border-accent/30">
            <CardContent className="pt-4 pb-3 px-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground font-medium flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-accent" />
                  Generating audio: {genProgress.current} / {genProgress.total}
                </span>
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {genProgress.currentSlug}
                </span>
              </div>
              <Progress value={(genProgress.current / Math.max(genProgress.total, 1)) * 100} className="h-2" />
              <p className="text-xs text-muted-foreground">
                Each article takes ~30–60 seconds (AI rewrite + TTS). Please keep this page open.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground">Total Articles</p>
              <p className="text-2xl font-bold text-foreground">{totalCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground">Cached</p>
              <p className="text-2xl font-bold text-accent">{cachedCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground">Not Cached</p>
              <p className="text-2xl font-bold text-muted-foreground">{uncachedCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground">Coverage</p>
              <p className="text-2xl font-bold text-foreground">
                {totalCount > 0 ? Math.round((cachedCount / totalCount) * 100) : 0}%
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Audio Cache Status</CardTitle>
            <CardDescription>Each row shows whether a cached MP3 exists for the article.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                <Loader2 size={16} className="animate-spin" /> Checking cache…
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Article</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audioMap.map((item) => (
                    <TableRow key={item.slug}>
                      <TableCell>
                        <div className="font-medium text-sm text-foreground leading-tight max-w-xs truncate">
                          {item.title}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{item.slug}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{item.category}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {item.cached ? (
                          <Badge className="bg-accent/10 text-accent border-accent/20 gap-1">
                            <CheckCircle2 size={12} /> Cached
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1 text-muted-foreground">
                            <XCircle size={12} /> Not cached
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {item.cached && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => togglePlay(item.slug, item.publicUrl)}
                                title="Preview audio"
                              >
                                {playingSlug === item.slug ? <Pause size={14} /> : <Play size={14} />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                onClick={() => handleDelete(item.slug)}
                                disabled={deletingSlug === item.slug}
                                title="Delete cached audio"
                              >
                                {deletingSlug === item.slug ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Trash2 size={14} />
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default AdminArticleAudio;
