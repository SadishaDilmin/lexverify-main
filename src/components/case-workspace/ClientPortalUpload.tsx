import { useState, useRef } from "react";
import { Upload, FileText, CheckCircle2, Loader2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { validateBatch, deduplicateFiles, sha256, parallelUpload } from "@/lib/uploadUtils";

interface ClientPortalUploadProps {
  caseId: string;
  caseReference: string;
  clientName: string;
  /** Token for unauthenticated client access */
  portalToken?: string;
}

interface UploadItem {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
}

export default function ClientPortalUpload({ caseId, caseReference, clientName, portalToken }: ClientPortalUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedHashes] = useState<Set<string>>(new Set());

  const addFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const { valid, rejected } = validateBatch(arr);
    if (rejected.length > 0) {
      toast({ title: `${rejected.length} file(s) rejected`, description: rejected[0].reason, variant: "destructive" });
    }
    const { unique, duplicates } = await deduplicateFiles(valid, uploadedHashes);
    if (duplicates.length > 0) {
      toast({ title: `${duplicates.length} duplicate(s) skipped` });
    }
    const newItems: UploadItem[] = unique.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "pending",
      progress: 0,
    }));
    setItems((prev) => [...prev, ...newItems]);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleUpload = async () => {
    const pending = items.filter((i) => i.status === "pending");
    if (pending.length === 0) return;
    setUploading(true);

    // Mark as uploading
    setItems((prev) => prev.map((i) => i.status === "pending" ? { ...i, status: "uploading" as const } : i));

    await parallelUpload(pending, async (item) => {
      const filePath = `${caseId}/client-uploads/${Date.now()}-${item.file.name}`;
      const { error } = await supabase.storage
        .from("case-documents")
        .upload(filePath, item.file, { upsert: true });
      if (error) {
        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "error" as const } : i));
        throw error;
      }

      // Record in documents table
      await supabase.from("documents").insert({
        case_id: caseId,
        doc_type: "correspondence",
        file_name: item.file.name,
        file_path: filePath,
        uploaded_by: portalToken || "client-portal",
        original_file_name: item.file.name,
        appears_complete: true,
      });

      // Track hash
      try { uploadedHashes.add(await sha256(item.file)); } catch {}

      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "done" as const, progress: 100 } : i));
    }, 3);

    setUploading(false);
    const doneCount = items.filter((i) => i.status === "done").length + pending.length;
    toast({ title: "Documents uploaded", description: `${doneCount} file(s) uploaded to case ${caseReference}.` });

    // Clear done after delay
    setTimeout(() => setItems((prev) => prev.filter((i) => i.status !== "done")), 2000);
  };

  return (
    <Card className="border-accent/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Upload size={14} className="text-accent" />
          Upload Documents
          <Badge variant="secondary" className="text-[9px] h-4">Client Portal</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {clientName}, please upload any requested documents for case <strong>{caseReference}</strong>.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />

        {items.length === 0 ? (
          <Button
            variant="outline"
            className="w-full gap-1.5"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} />
            Choose files to upload
          </Button>
        ) : (
          <>
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-xs">
                  <FileText size={12} className="text-accent shrink-0" />
                  <span className="flex-1 truncate">{item.file.name}</span>
                  {item.status === "done" && <CheckCircle2 size={14} className="text-[hsl(var(--risk-green))]" />}
                  {item.status === "uploading" && <Loader2 size={14} className="animate-spin text-accent" />}
                  {item.status === "error" && <span className="text-destructive text-[10px]">Failed</span>}
                  {item.status === "pending" && (
                    <button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-foreground">
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                Add more
              </Button>
              <Button
                size="sm"
                className="flex-1 gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={handleUpload}
                disabled={uploading || items.filter((i) => i.status === "pending").length === 0}
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Upload {items.filter((i) => i.status === "pending").length} file(s)
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
