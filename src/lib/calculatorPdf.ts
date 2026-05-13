// jsPDF is dynamically imported to reduce initial bundle size

interface CalculatorData {
  hourlyRate: number;
  casesPerFeeEarner: number;
  totalFirmCases: number;
  avgFee: number;
  claimProbability: number;
  manualHoursPerCase: number;
  aiMinutesPerCase: number;
  aiClaimReductionPct: number;
  avgClaimCost: number;
  /* Derived */
  manualCostPerCase: number;
  aiCostEquivPerCase: number;
  savingPerCase: number;
  totalSaving: number;
  hoursFreedPerCase: number;
  totalHoursFreed: number;
  additionalCases: number;
  additionalRevenue: number;
  manualClaimCostAnnual: number;
  aiClaimCostAnnual: number;
  claimSaving: number;
  totalBenefit: number;
  /* Period */
  period: "monthly" | "annual";
  agentCount: number;
}

const GBP = (n: number, decimals = 0) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);

export async function generateCalculatorPdf(data: CalculatorData) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginL = 20;
  const marginR = 20;
  const contentW = pageW - marginL - marginR;
  let y = 20;

  const mult = data.period === "monthly" ? 1 / 12 : 1;
  const periodLabel = data.period === "monthly" ? "(Monthly)" : "(Annual)";

  /* ─── Header bar ─── */
  doc.setFillColor(38, 47, 68);
  doc.rect(0, 0, pageW, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Olimey AI", marginL, 12);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`AI Agent Profitability Calculator — Results Summary ${periodLabel}`, marginL, 19);

  const dateStr = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  doc.setFontSize(8);
  doc.text(dateStr, pageW - marginR, 19, { align: "right" });

  y = 38;

  /* ─── Helper functions ─── */
  const sectionTitle = (title: string) => {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(38, 47, 68);
    doc.text(title, marginL, y);
    y += 2;
    doc.setDrawColor(207, 88, 24);
    doc.setLineWidth(0.6);
    doc.line(marginL, y, marginL + 40, y);
    y += 6;
  };

  const row = (label: string, value: string, bold = false) => {
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(label, marginL, y);
    doc.setTextColor(38, 47, 68);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(value, pageW - marginR, y, { align: "right" });
    y += 6;
  };

  const divider = () => {
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(marginL, y - 2, pageW - marginR, y - 2);
    y += 2;
  };

  /* ─── Your inputs ─── */
  sectionTitle("Your Inputs");
  row("Conveyancer hourly rate", GBP(data.hourlyRate));
  row("Live cases per conveyancer", `${data.casesPerFeeEarner}`);
  row("Total live cases (firm)", `${data.totalFirmCases}`);
  row("Average fee per transaction", GBP(data.avgFee));
  row("Negligence claim probability", `${data.claimProbability}%`);
  row("AI agents selected", `${data.agentCount}`);
  y += 4;

  /* ─── Headline results ─── */
  sectionTitle("Headline Results");

  // Accent highlight box
  doc.setFillColor(255, 247, 240);
  doc.roundedRect(marginL, y - 4, contentW, 28, 3, 3, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);

  const col1 = marginL + 8;
  const col2 = marginL + contentW / 3 + 4;
  const col3 = marginL + (contentW * 2) / 3 + 4;

  doc.text("Time Cost Saved", col1, y + 4);
  doc.text("Additional Revenue", col2, y + 4);
  doc.text("Risk Cost Reduction", col3, y + 4);

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(207, 88, 24);
  doc.text(GBP(data.totalSaving * mult), col1, y + 14);
  doc.text(GBP(data.additionalRevenue * mult), col2, y + 14);
  doc.text(GBP(data.claimSaving * mult), col3, y + 14);

  y += 32;

  // Total benefit
  doc.setFillColor(38, 47, 68);
  doc.roundedRect(marginL, y - 4, contentW, 14, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Total Estimated Benefit ${periodLabel}`, marginL + 8, y + 4);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(GBP(data.totalBenefit * mult), pageW - marginR - 8, y + 4, { align: "right" });

  y += 22;

  /* ─── Detailed breakdown ─── */
  sectionTitle("Detailed Breakdown");
  row("Manual review time per case", `${data.manualHoursPerCase} hours`);
  row("AI review time per case", `${data.aiMinutesPerCase} minutes`);
  row("Time freed per case", `${data.hoursFreedPerCase.toFixed(1)} hours`);
  row("Total hours freed across caseload", `${data.totalHoursFreed.toFixed(0)} hours`);
  divider();
  row("Cost of manual review per case", GBP(data.manualCostPerCase, 2));
  row("Equivalent AI cost per case (staff time)", GBP(data.aiCostEquivPerCase, 2));
  row("Net saving per case", GBP(data.savingPerCase, 2), true);
  divider();
  row("Additional cases capacity", `${data.additionalCases} cases`);
  row("Additional revenue at avg fee", GBP(data.additionalRevenue), true);
  divider();
  row("Manual claim exposure (annual est.)", GBP(data.manualClaimCostAnnual));
  row("AI-assisted claim exposure", GBP(data.aiClaimCostAnnual));
  row("Risk cost reduction", GBP(data.claimSaving), true);

  y += 8;

  /* ─── Disclaimer ─── */
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(150, 150, 150);
  const disclaimer =
    "These estimates are illustrative only, based on industry averages for conveyancing compliance and document review. " +
    `Actual savings will vary depending on case complexity, firm processes, and the types of searches conducted. ` +
    `The average PI claim cost used is ${GBP(data.avgClaimCost)} based on industry data.`;
  const lines = doc.splitTextToSize(disclaimer, contentW);
  doc.text(lines, marginL, y);
  y += lines.length * 4 + 6;

  /* ─── Footer ─── */
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(marginL, y, pageW - marginR, y);
  y += 5;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(150, 150, 150);
  doc.text("© 2026 Olimey AI · olimey.ai", marginL, y);
  doc.text("Generated by Olimey AI Benefit Calculator", pageW - marginR, y, { align: "right" });

  return doc;
}

export type { CalculatorData };
