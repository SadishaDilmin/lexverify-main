import { useState, useCallback, useEffect, forwardRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, X, ZoomIn, ZoomOut, Download, Maximize2, Minimize2, FileText, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { EvidenceReference } from "./types";
import EvidenceMetadataPanel from "./EvidenceMetadataPanel";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".svg"]);
const PDF_EXTENSIONS = new Set([".pdf"]);

function getExt(name: string) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function isMockRef(ref: EvidenceReference) {
  return ref.id.startsWith("mock-");
}

interface EvidenceViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  references: EvidenceReference[];
  bucket: string;
  caseId?: string;
  sectionHeading: string;
  itemLabel: string;
}

export default function EvidenceViewerDialog({
  open,
  onOpenChange,
  references,
  bucket,
  caseId,
  sectionHeading,
  itemLabel,
}: EvidenceViewerDialogProps) {
  const { toast } = useToast();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [fullscreen, setFullscreen] = useState(false);

  const current = references[currentIndex];
  const isDemo = current ? isMockRef(current) : false;

  /** Resolve the real storage path for a reference, trying case subfolders for mock refs */
  const resolveDocumentPath = useCallback((ref: EvidenceReference): string => {
    if (!isMockRef(ref)) return ref.document_path;
    // For mock refs, construct path from caseId + document_name
    if (caseId) return `${caseId}/aml-sow/${ref.document_name}`;
    return ref.document_path;
  }, [caseId]);

  const fetchUrl = useCallback(async (ref: EvidenceReference) => {
    if (!ref?.document_path) return;
    const resolvedPath = resolveDocumentPath(ref);
    setLoading(true);
    setError(null);
    setUrl(null);
    try {
      const { data, error: signError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(resolvedPath, 3600);
      if (signError || !data?.signedUrl) throw new Error(signError?.message || "Failed to generate URL");
      setUrl(data.signedUrl);
    } catch (e: any) {
      // For mock refs, silently fall back to preview mode
      if (isMockRef(ref)) {
        setUrl(null);
        setError(null);
      } else {
        setError(e.message);
        toast({ title: "Cannot open source document", description: e.message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  }, [bucket, toast, resolveDocumentPath]);

  useEffect(() => {
    if (open && current) {
      setCurrentIndex(0);
      fetchUrl(current);
    }
    if (!open) {
      setUrl(null);
      setError(null);
      setZoom(100);
      setFullscreen(false);
      setCurrentIndex(0);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && current) {
      fetchUrl(current);
    }
  }, [currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = async () => {
    if (!current) return;
    const resolvedPath = resolveDocumentPath(current);
    const { data, error } = await supabase.storage.from(bucket).download(resolvedPath);
    if (error || !data) {
      toast({ title: "Download failed", description: error?.message, variant: "destructive" });
      return;
    }
    const blobUrl = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = current.document_name;
    a.click();
    URL.revokeObjectURL(blobUrl);
  };

  if (!current) return null;

  const ext = getExt(current.document_name);
  const isImg = IMAGE_EXTENSIONS.has(ext);
  const isPdf = PDF_EXTENSIONS.has(ext);

  const pdfUrl = url && isPdf
    ? `${url}#toolbar=1&navpanes=0${current.page_number ? `&page=${current.page_number}` : ""}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${
          fullscreen
            ? "max-w-[100vw] max-h-[100vh] w-screen h-screen rounded-none"
            : "max-w-[95vw] w-[1400px] h-[90vh]"
        } flex flex-col p-0 gap-0 overflow-hidden`}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/50 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate max-w-[400px]">
              Evidence Verification
            </h3>
            <span className="text-xs text-muted-foreground">— {current.document_name}</span>
          </div>
          <div className="flex items-center gap-1">
            {url && isImg && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.max(25, z - 25))}>
                  <ZoomOut size={16} />
                </Button>
                <span className="text-xs text-muted-foreground w-12 text-center">{zoom}%</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.min(400, z + 25))}>
                  <ZoomIn size={16} />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFullscreen(f => !f)}>
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </Button>
            {url && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload}>
                <Download size={16} />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)}>
              <X size={16} />
            </Button>
          </div>
        </div>

        {/* Three-panel layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel — metadata */}
          <div className="w-[300px] shrink-0 border-r border-border overflow-y-auto bg-card">
            <EvidenceMetadataPanel
              references={references}
              currentIndex={currentIndex}
              onNavigate={setCurrentIndex}
              onClose={() => onOpenChange(false)}
              sectionHeading={sectionHeading}
              itemLabel={itemLabel}
            />
          </div>

          {/* Center — document viewer */}
          <div className="flex-1 overflow-auto bg-muted/20 flex items-center justify-center relative">
            {/* Loading state */}
            {loading && (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 size={32} className="animate-spin" />
                <span className="text-sm">Loading source document…</span>
              </div>
            )}

            {/* Error state (non-mock only) */}
            {!isDemo && error && (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <span className="text-sm text-destructive">{error}</span>
                <Button variant="outline" size="sm" onClick={() => current && fetchUrl(current)}>
                  Retry
                </Button>
              </div>
            )}

            {/* Real document — PDF */}
            {pdfUrl && (
              <iframe src={pdfUrl} className="w-full h-full border-0" title={current.document_name} />
            )}

            {/* Real document — Image */}
            {url && isImg && (
              <div className="overflow-auto w-full h-full flex items-center justify-center p-4 relative">
                <img
                  src={url}
                  alt={current.document_name}
                  className="max-w-none transition-transform duration-200"
                  style={{ width: `${zoom}%` }}
                />
                {current.anchor_text && (
                  <div className="absolute inset-x-0 bottom-4 flex justify-center pointer-events-none">
                    <div className="bg-yellow-200/80 dark:bg-yellow-700/50 border border-yellow-400 dark:border-yellow-600 rounded-md px-3 py-1.5 max-w-md">
                      <p className="text-xs text-foreground font-medium text-center">
                        🔍 "{current.anchor_text}"
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Real document — unsupported format */}
            {url && !isPdf && !isImg && (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <span className="text-sm">Preview not available for {ext} files</span>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download size={14} className="mr-1.5" /> Download
                </Button>
                {current.source_snippet && (
                  <div className="max-w-md rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/40 p-3 mt-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Source Snippet</p>
                    <p className="text-xs text-foreground italic">"{current.source_snippet}"</p>
                  </div>
                )}
              </div>
            )}

            {/* Snippet banner for PDFs */}
            {isPdf && url && !current.anchor_text && current.source_snippet && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 max-w-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/40 rounded-md px-4 py-2 shadow-lg">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">Evidence Snippet</p>
                <p className="text-xs text-foreground italic leading-relaxed">"{current.source_snippet}"</p>
              </div>
            )}

            {/* Fallback — no document available */}
            {!url && !loading && !error && (
              <div className="flex flex-col items-center gap-4 p-8 text-muted-foreground">
                <FileText size={40} className="opacity-40" />
                <p className="text-sm font-medium">Source document view unavailable</p>
                <p className="text-xs text-center max-w-sm">
                  The referenced document <span className="font-medium text-foreground">{current.document_name}</span> could not be located in the case files.
                </p>
                {current.source_snippet && (
                  <div className="max-w-md rounded-md bg-muted/40 border border-border p-3 mt-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Extracted Snippet</p>
                    <p className="text-xs text-foreground italic">"{current.source_snippet}"</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
