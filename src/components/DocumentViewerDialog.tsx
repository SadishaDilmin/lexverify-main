import { useState, useCallback, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Download, Loader2, ZoomIn, ZoomOut, RotateCw, Maximize2, Minimize2, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".svg"];
const PDF_EXTENSIONS = [".pdf"];

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function isImage(name: string) {
  return IMAGE_EXTENSIONS.includes(getFileExtension(name));
}

function isPdf(name: string) {
  return PDF_EXTENSIONS.includes(getFileExtension(name));
}

export function canPreview(fileName: string) {
  return isPdf(fileName) || isImage(fileName);
}

interface DocumentViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bucket: string;
  filePath: string;
  fileName: string;
}

type PreviewDebugInfo = {
  fileType: "pdf" | "image" | "other";
  source: "storage-download" | "signed-url";
  renderMethod: "pdfjs-canvas" | "img-signed-url" | "none";
  blobSize?: number;
  blobType?: string;
  loadState: "idle" | "loading" | "loaded" | "failed";
  failureReason?: string;
};

export default function DocumentViewerDialog({
  open,
  onOpenChange,
  bucket,
  filePath,
  fileName,
}: DocumentViewerDialogProps) {
  const { toast } = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [previewDebug, setPreviewDebug] = useState<PreviewDebugInfo | null>(null);
  const [detectedMime, setDetectedMime] = useState<string | null>(null);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfScale, setPdfScale] = useState(1.2);
  const [pdfRendering, setPdfRendering] = useState(false);
  const [pdfRenderError, setPdfRenderError] = useState<string | null>(null);
  const [pdfReady, setPdfReady] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const pdfDocRef = useRef<any>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const cleanupPdfDocument = useCallback(() => {
    if (pdfDocRef.current?.destroy) {
      try {
        pdfDocRef.current.destroy();
      } catch {
        // noop
      }
    }
    pdfDocRef.current = null;
    setPdfReady(false);
    setPdfPage(1);
    setPdfTotalPages(0);
    setPdfRendering(false);
    setPdfRenderError(null);
  }, []);

  const cleanupBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  const fetchUrl = useCallback(async () => {
    if (!bucket || !filePath) return;
    setLoading(true);
    setError(null);
    setPdfBlob(null);
    cleanupPdfDocument();
    cleanupBlobUrl();
    try {
      if (isPdf(fileName)) {
        setPreviewDebug({
          fileType: "pdf",
          source: "storage-download",
          renderMethod: "pdfjs-canvas",
          loadState: "loading",
        });

        // Fetch as blob, then render with PDF.js canvas (not browser-native PDF plugin)
        const { data, error: dlError } = await supabase.storage.from(bucket).download(filePath);
        if (dlError || !data) throw new Error(dlError?.message || "Failed to download file");

        const pdfBlob = data.type === "application/pdf" ? data : new Blob([data], { type: "application/pdf" });
        if (pdfBlob.size === 0) throw new Error("Downloaded PDF is empty");

        const blobUrl = URL.createObjectURL(pdfBlob);
        blobUrlRef.current = blobUrl;
        setUrl(blobUrl);
        setPdfBlob(pdfBlob);
        setPdfScale(1.2);

        setPreviewDebug((prev) => prev ? {
          ...prev,
          blobSize: pdfBlob.size,
          blobType: pdfBlob.type || "unknown",
        } : prev);

        console.info("[DocumentViewerDialog][PDF] Blob fetched", {
          fileName,
          blobSize: pdfBlob.size,
          blobType: pdfBlob.type || "unknown",
          renderer: "pdfjs-canvas",
        });
      } else {
        setPreviewDebug({
          fileType: "image",
          source: "signed-url",
          renderMethod: "img-signed-url",
          loadState: "loading",
        });

        // For images and unknown extensions: signed URL + MIME sniff via HEAD
        const { data, error: signError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(filePath, 3600);
        if (signError || !data?.signedUrl) throw new Error(signError?.message || "Failed to generate URL");
        setUrl(data.signedUrl);

        // If the filename has no recognised extension, sniff the Content-Type
        // so genuine images stored without an extension still preview.
        if (!isImage(fileName) && !isPdf(fileName)) {
          try {
            const head = await fetch(data.signedUrl, { method: "HEAD" });
            const ct = head.headers.get("content-type") || "";
            setDetectedMime(ct);
          } catch {
            // Network/CORS failure on HEAD is non-fatal — fall back to "other".
          }
        }

        setPreviewDebug((prev) => prev ? {
          ...prev,
          loadState: "loaded",
        } : prev);
      }
    } catch (e: any) {
      setError(e.message);
      setPreviewDebug((prev) => ({
        fileType: prev?.fileType ?? (isPdf(fileName) ? "pdf" : isImage(fileName) ? "image" : "other"),
        source: prev?.source ?? (isPdf(fileName) ? "storage-download" : "signed-url"),
        renderMethod: prev?.renderMethod ?? "none",
        blobSize: prev?.blobSize,
        blobType: prev?.blobType,
        loadState: "failed",
        failureReason: e.message,
      }));
      toast({ title: "Cannot open file", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [bucket, filePath, fileName, toast, cleanupBlobUrl, cleanupPdfDocument]);

  useEffect(() => {
    if (open && !url && !loading && filePath) {
      fetchUrl();
    }
    if (!open) {
      cleanupPdfDocument();
      cleanupBlobUrl();
      setUrl(null);
      setPdfBlob(null);
      setError(null);
      setPreviewDebug(null);
      setDetectedMime(null);
      setZoom(100);
      setRotation(0);
      setFullscreen(false);
      setPdfScale(1.2);
    }
  }, [open, filePath, loading, url, fetchUrl, cleanupPdfDocument, cleanupBlobUrl]);

  useEffect(() => {
    if (!open || !isPdf(fileName) || !pdfBlob) return;

    let cancelled = false;
    setPdfRendering(true);
    setPdfRenderError(null);
    setPdfReady(false);

    const loadPdfDocument = async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.mjs",
          import.meta.url,
        ).toString();
        const bytes = await pdfBlob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        const pdf = await loadingTask.promise;

        if (cancelled) {
          pdf.destroy?.();
          return;
        }

        if (pdfDocRef.current?.destroy) {
          try {
            pdfDocRef.current.destroy();
          } catch {
            // noop
          }
        }

        pdfDocRef.current = pdf;
        setPdfTotalPages(pdf.numPages || 1);
        setPdfPage(1);
        setPdfReady(true);

        console.info("[DocumentViewerDialog][PDF] Document loaded", {
          fileName,
          pages: pdf.numPages || 1,
          renderer: "pdfjs-canvas",
        });
      } catch (e: any) {
        if (cancelled) return;
        const message = e?.message || "Failed to initialize PDF renderer";
        setPdfRenderError(message);
        setPreviewDebug((prev) => prev ? {
          ...prev,
          loadState: "failed",
          failureReason: message,
        } : prev);
        console.error("[DocumentViewerDialog][PDF] Renderer init failed", { fileName, message });
      } finally {
        if (!cancelled) setPdfRendering(false);
      }
    };

    loadPdfDocument();

    return () => {
      cancelled = true;
    };
  }, [open, fileName, pdfBlob]);

  useEffect(() => {
    if (!open || !isPdf(fileName) || !pdfReady || !pdfDocRef.current || !pdfCanvasRef.current) return;

    let cancelled = false;
    setPdfRendering(true);
    setPdfRenderError(null);

    const renderPdfPage = async () => {
      try {
        const page = await pdfDocRef.current.getPage(pdfPage);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: pdfScale });
        const canvas = pdfCanvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas context unavailable");

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);

        const renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;

        if (cancelled) return;

        setPreviewDebug((prev) => prev ? {
          ...prev,
          loadState: "loaded",
          failureReason: undefined,
        } : prev);

        console.info("[DocumentViewerDialog][PDF] Page rendered", {
          fileName,
          page: pdfPage,
          scale: pdfScale,
          renderer: "pdfjs-canvas",
        });
      } catch (e: any) {
        if (cancelled) return;
        const message = e?.message || "PDF page render failed";
        setPdfRenderError(message);
        setPreviewDebug((prev) => prev ? {
          ...prev,
          loadState: "failed",
          failureReason: message,
        } : prev);
        console.error("[DocumentViewerDialog][PDF] Render failed", { fileName, page: pdfPage, message });
      } finally {
        if (!cancelled) setPdfRendering(false);
      }
    };

    renderPdfPage();

    return () => {
      cancelled = true;
    };
  }, [open, fileName, pdfReady, pdfPage, pdfScale]);

  // Cleanup on unmount
  useEffect(() => () => {
    cleanupPdfDocument();
    cleanupBlobUrl();
  }, [cleanupBlobUrl, cleanupPdfDocument]);

  const handleDownload = async () => {
    const { data, error } = await supabase.storage.from(bucket).download(filePath);
    if (error || !data) {
      toast({ title: "Download failed", description: error?.message, variant: "destructive" });
      return;
    }
    const blobUrl = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(blobUrl);
  };

  const handleOpenNewTab = () => {
    if (url) window.open(url, "_blank");
  };

  const ext = getFileExtension(fileName);
  const mimeIsImage = !!detectedMime && detectedMime.toLowerCase().startsWith("image/");
  const mimeIsPdf = !!detectedMime && detectedMime.toLowerCase().includes("pdf");
  const isImg = isImage(fileName) || mimeIsImage;
  const isPdfFile = isPdf(fileName) || mimeIsPdf;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${
          fullscreen
            ? "max-w-[100vw] max-h-[100vh] w-screen h-screen rounded-none"
            : "max-w-5xl w-[95vw] h-[90vh]"
        } flex flex-col p-0 gap-0 overflow-hidden`}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/50 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate max-w-[300px] sm:max-w-[500px]">
              {fileName}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            {isImg && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setZoom((z) => Math.max(25, z - 25))}
                  title="Zoom out"
                >
                  <ZoomOut size={16} />
                </Button>
                <span className="text-xs text-muted-foreground w-12 text-center">{zoom}%</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setZoom((z) => Math.min(400, z + 25))}
                  title="Zoom in"
                >
                  <ZoomIn size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  title="Rotate"
                >
                  <RotateCw size={16} />
                </Button>
              </>
            )}
            {isPdfFile && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPdfScale((s) => Math.max(0.75, s - 0.25))}
                  title="Zoom out"
                >
                  <ZoomOut size={16} />
                </Button>
                <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(pdfScale * 100)}%</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPdfScale((s) => Math.min(3, s + 0.25))}
                  title="Zoom in"
                >
                  <ZoomIn size={16} />
                </Button>

                {pdfTotalPages > 0 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
                      disabled={pdfPage <= 1 || !!pdfRenderError || !pdfReady}
                      title="Previous page"
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {pdfPage} / {pdfTotalPages}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPdfPage((p) => Math.min(pdfTotalPages, p + 1))}
                      disabled={pdfPage >= pdfTotalPages || !!pdfRenderError || !pdfReady}
                      title="Next page"
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </>
                )}
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setFullscreen((f) => !f)}
              title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload} title="Download">
              <Download size={16} />
            </Button>
            {url && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleOpenNewTab} title="Open in new tab">
                <ExternalLink size={16} />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onOpenChange(false)}
              title="Close"
            >
              <X size={16} />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-muted/20 flex items-center justify-center">
          {loading && (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 size={32} className="animate-spin" />
              <span className="text-sm">Loading document…</span>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-4 text-muted-foreground p-8">
              <span className="text-sm text-destructive">{error}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchUrl}>
                  Retry
                </Button>
                {url && (
                  <Button variant="outline" size="sm" onClick={handleOpenNewTab}>
                    <ExternalLink size={14} className="mr-1.5" />
                    Open in new tab
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download size={14} className="mr-1.5" />
                  Download instead
                </Button>
              </div>
            </div>
          )}

          {url && isPdfFile && !error && !pdfRenderError && !pdfReady && (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 size={32} className="animate-spin" />
              <span className="text-sm">Rendering PDF preview…</span>
            </div>
          )}

          {url && isPdfFile && !error && !pdfRenderError && pdfReady && (
            <div className="w-full h-full overflow-auto p-4 relative">
              {pdfRendering && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted/30 z-10">
                  <Loader2 size={24} className="animate-spin text-muted-foreground" />
                </div>
              )}
              <div className="w-fit mx-auto rounded-md border border-border bg-background shadow-sm">
                <canvas ref={pdfCanvasRef} className="block max-w-full h-auto" />
              </div>
            </div>
          )}

          {url && isPdfFile && !error && !!pdfRenderError && (
            <div className="flex flex-col items-center gap-4 text-muted-foreground p-8 max-w-xl text-center">
              <span className="text-sm font-medium text-foreground">PDF preview unavailable</span>
              <p className="text-xs text-muted-foreground">
                The PDF file loaded but could not be rendered by the in-app viewer.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchUrl}>Retry</Button>
                <Button variant="outline" size="sm" onClick={handleOpenNewTab}>
                  <ExternalLink size={14} className="mr-1.5" />
                  Open in new tab
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download size={14} className="mr-1.5" />
                  Download
                </Button>
              </div>
              {previewDebug && (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Render: {previewDebug.renderMethod} · Blob type: {previewDebug.blobType || "unknown"} · Blob size: {previewDebug.blobSize ?? 0} bytes · State: {previewDebug.loadState}
                  {previewDebug.failureReason ? ` · Reason: ${previewDebug.failureReason}` : ""}
                </p>
              )}
            </div>
          )}

          {url && isImg && (
            <div className="overflow-auto w-full h-full flex items-center justify-center p-4">
              <img
                src={url}
                alt={fileName}
                className="max-w-none transition-transform duration-200"
                style={{
                  width: `${zoom}%`,
                  transform: `rotate(${rotation}deg)`,
                }}
              />
            </div>
          )}

          {url && !isPdfFile && !isImg && (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <span className="text-sm">Preview not available for {ext} files</span>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download size={14} className="mr-1.5" />
                Download
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
