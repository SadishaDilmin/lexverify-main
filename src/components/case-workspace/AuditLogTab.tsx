import { memo } from "react";
import { Clock, FileDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface AuditEntry {
  id: string;
  event_type: string;
  user_name: string;
  user_position: string;
  created_at: string;
  metadata: any;
}

interface AuditLogTabProps {
  auditLog: AuditEntry[];
  caseReference: string;
  onExportPdf: (params: any) => void;
}

function AuditLogTab({ auditLog, caseReference, onExportPdf }: AuditLogTabProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Audit Log</CardTitle>
        {auditLog.length > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onExportPdf({
            caseReference, entries: auditLog,
          })}>
            <FileDown size={14} /> Export PDF
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {auditLog.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No audit log entries yet.</p>
        ) : (
          <div className="space-y-2">
            {auditLog.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                <Clock size={14} className="text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{entry.event_type}</span>
                    {entry.metadata && (
                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {typeof entry.metadata === "string" ? entry.metadata : JSON.stringify(entry.metadata)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {entry.user_name} · {entry.user_position} · {new Date(entry.created_at).toLocaleString("en-GB")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default memo(AuditLogTab);
