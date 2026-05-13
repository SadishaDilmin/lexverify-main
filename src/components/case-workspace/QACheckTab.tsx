import { memo } from "react";
import { CheckCircle2, XCircle, FileDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface QACheckTabProps {
  qaResult: {
    pass: boolean;
    warn: boolean;
    ai_run_id: string;
    checklist: Array<{ section: string; items: Array<{ id: number; text: string; pass: boolean }> }>;
  } | null;
  caseReference: string;
  feeEarner: string;
  onExportPdf: (params: any) => void;
}

function QACheckTab({ qaResult, caseReference, feeEarner, onExportPdf }: QACheckTabProps) {
  if (!qaResult) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Hallucination Evaluation Checklist</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">No QA results available yet.</p>
        </CardContent>
      </Card>
    );
  }

  const checklist = (qaResult.checklist as Array<{ section: string; items: Array<{ id: number; text: string; pass: boolean }> }>) || [];

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Hallucination Evaluation Checklist</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-4">
          {checklist.map((section) => (
            <div key={section.section}>
              <h4 className="text-sm font-semibold text-foreground mb-2">{section.section}</h4>
              <div className="space-y-1.5">
                {section.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/30">
                    {item.pass ? (
                      <CheckCircle2 size={14} className="text-risk-green shrink-0" />
                    ) : (
                      <XCircle size={14} className="text-risk-red shrink-0" />
                    )}
                    <span className="text-muted-foreground">{item.id}. {item.text}</span>
                    <span className={`ml-auto text-xs font-medium ${item.pass ? "text-risk-green" : "text-risk-red"}`}>
                      {item.pass ? "Pass" : "Fail"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className={`${qaResult.pass ? "bg-risk-green-bg" : "bg-risk-red-bg"} rounded-lg p-4 text-center`}>
            {qaResult.pass ? (
              <CheckCircle2 size={24} className="text-risk-green mx-auto mb-2" />
            ) : (
              <XCircle size={24} className="text-risk-red mx-auto mb-2" />
            )}
            <p className={`text-sm font-semibold ${qaResult.pass ? "text-risk-green" : "text-risk-red"}`}>
              QA Check: {qaResult.pass ? "PASS" : "FAIL"}{qaResult.warn ? " (with warnings)" : ""}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Run {qaResult.ai_run_id}</p>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onExportPdf({
              caseReference, feeEarner,
              pass: qaResult.pass, warn: qaResult.warn,
              aiRunId: qaResult.ai_run_id, checklist,
            })}>
              <FileDown size={14} /> Export PDF
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default memo(QACheckTab);
