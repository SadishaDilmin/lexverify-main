import { memo } from "react";
import { motion } from "framer-motion";
import { Download, FileDown, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import RiskBadge from "@/components/RiskBadge";
import RiskScoreTrendChart from "@/components/RiskScoreTrendChart";
import type { RiskLevel } from "@/types";

interface RiskScoreTabProps {
  caseId: string;
  caseReference: string;
  propertyAddress: string;
  feeEarner: string;
  riskScore: {
    total_score: number;
    risk_level: string;
    local_search_score: number;
    drainage_water_score: number;
    environmental_score: number;
    epc_score: number;
    top_drivers: Array<{ description: string; reference: string; impact: number }>;
  } | null;
  onExportDocx: (params: any) => void;
  onExportPdf: (params: any) => void;
}

const SCORE_CATEGORIES = [
  { label: "Local Search", key: "local_search_score" as const, max: 25 },
  { label: "Drainage & Water", key: "drainage_water_score" as const, max: 25 },
  { label: "Environmental", key: "environmental_score" as const, max: 35 },
  { label: "EPC", key: "epc_score" as const, max: 15 },
];

const METHODOLOGY = [
  { cat: "Environmental", max: 35, desc: "Flood zone designation, contaminated land entries, landfill proximity, radon risk, and subsidence indicators." },
  { cat: "Local Authority Search", max: 25, desc: "Planning enforcement notices, tree preservation orders, conservation area restrictions, highway adoption status, and building control issues." },
  { cat: "Drainage & Water", max: 25, desc: "Sewer adoption status, surface water drainage issues, water main proximity, and connection irregularities." },
  { cat: "EPC", max: 15, desc: "Energy rating (F/G = highest impact), wall/roof insulation deficiencies, and recommended improvement costs." },
];

function RiskScoreTab({ caseId, caseReference, propertyAddress, feeEarner, riskScore, onExportDocx, onExportPdf }: RiskScoreTabProps) {
  if (!riskScore) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Info size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No risk score available yet. Run the AI review to generate one.</p>
        </CardContent>
      </Card>
    );
  }

  const topDrivers = riskScore.top_drivers || [];
  const scores = SCORE_CATEGORIES.map((c) => ({ ...c, score: riskScore[c.key] }));

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Risk Score Breakdown</CardTitle>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                  <Info size={14} /> How Scoring Works
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Risk Score Methodology</DialogTitle>
                  <DialogDescription>How Olimey AI calculates the risk score for each case.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 text-sm text-muted-foreground">
                  <p>Each case receives a deterministic risk score from <strong className="text-foreground">0–100</strong> based on the contents of uploaded property search documents and the EPC certificate.</p>
                  <div className="space-y-2">
                    {METHODOLOGY.map((c) => (
                      <div key={c.cat} className="p-3 bg-muted/40 rounded-lg">
                        <div className="flex justify-between mb-1">
                          <span className="font-medium text-foreground">{c.cat}</span>
                          <span className="font-mono text-xs">max {c.max} pts</span>
                        </div>
                        <p className="text-xs leading-relaxed">{c.desc}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium text-foreground">Risk Levels</p>
                    <ul className="space-y-1 text-xs">
                      <li><span className="inline-block w-2 h-2 rounded-full bg-risk-green mr-2" /><strong className="text-foreground">Green (0–29):</strong> Low risk.</li>
                      <li><span className="inline-block w-2 h-2 rounded-full bg-risk-amber mr-2" /><strong className="text-foreground">Amber (30–59):</strong> Moderate risk.</li>
                      <li><span className="inline-block w-2 h-2 rounded-full bg-risk-red mr-2" /><strong className="text-foreground">Red (60–100):</strong> High risk.</li>
                    </ul>
                  </div>
                  <p className="text-[11px] italic border-t border-border pt-3">This score is an internal prioritisation aid; not legal advice.</p>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="text-center py-4">
              <div className="text-5xl font-bold font-mono text-foreground mb-2">{riskScore.total_score}</div>
              <RiskBadge level={riskScore.risk_level as RiskLevel} />
            </div>
            {scores.map((item) => (
              <div key={item.label} className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-mono font-medium">{item.score}/{item.max}</span>
                </div>
                <Progress value={(item.score / item.max) * 100} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top Risk Drivers</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {topDrivers.map((driver, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg"
              >
                <div className="bg-risk-amber-bg text-risk-amber rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold shrink-0">
                  +{driver.impact}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{driver.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{driver.reference}</p>
                </div>
              </motion.div>
            ))}
            <p className="text-[11px] text-muted-foreground italic pt-2">Risk score is an internal prioritisation aid; not legal advice.</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <RiskScoreTrendChart caseId={caseId} />
      </div>

      <div className="flex justify-end mt-4 gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onExportDocx({
          caseReference, propertyAddress, feeEarner,
          totalScore: riskScore.total_score, riskLevel: riskScore.risk_level,
          scores, topDrivers,
        })}>
          <Download size={14} /> Export .docx
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onExportPdf({
          caseReference, propertyAddress, feeEarner,
          totalScore: riskScore.total_score, riskLevel: riskScore.risk_level,
          scores, topDrivers,
        })}>
          <FileDown size={14} /> Export PDF
        </Button>
      </div>
    </>
  );
}

export default memo(RiskScoreTab);
