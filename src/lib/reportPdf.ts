/**
 * Reusable PDF report generator for Olimey AI reports.
 * Produces well-formatted A4 documents with branded headers,
 * structured sections, tables, and professional typography.
 */

interface ReportPdfOptions {
  title: string;
  subtitle?: string;
  caseReference?: string;
  propertyAddress?: string;
  feeEarner?: string;
  content: string;
  /** If true, content is plain text (no markdown parsing) */
  plainText?: boolean;
  disclaimer?: string;
}

interface RiskScorePdfOptions {
  caseReference: string;
  propertyAddress: string;
  feeEarner: string;
  totalScore: number;
  riskLevel: string;
  scores: { label: string; score: number; max: number }[];
  topDrivers: { description: string; impact: number; reference: string }[];
}

interface QACheckPdfOptions {
  caseReference: string;
  feeEarner: string;
  pass: boolean;
  warn: boolean;
  aiRunId: string;
  checklist: { section: string; items: { id: string | number; text: string; pass: boolean }[] }[];
}

interface AuditLogPdfOptions {
  caseReference: string;
  entries: {
    event_type: string;
    user_name: string;
    user_position: string;
    created_at: string;
    metadata?: any;
  }[];
}

// ── Shared helpers ─────────────────────────────────────────────────────

const BRAND_DARK = [38, 47, 68] as const;
const BRAND_ACCENT = [207, 88, 24] as const;
const TEXT_GREY = [100, 100, 100] as const;
const TEXT_DARK = [38, 47, 68] as const;
const LIGHT_BG = [248, 249, 251] as const;

async function createDoc() {
  const { default: jsPDF } = await import("jspdf");
  return new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
}

function drawHeader(doc: any, title: string, subtitle?: string) {
  const pageW = doc.internal.pageSize.getWidth();
  const marginL = 18;

  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 0, pageW, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.setFont("helvetica", "bold");
  doc.text("Olimey AI", marginL, 12);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(title, marginL, 19);

  if (subtitle) {
    doc.setFontSize(8);
    doc.text(subtitle, marginL, 24);
  }

  const dateStr = new Date().toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
  doc.setFontSize(8);
  doc.text(dateStr, pageW - 18, 19, { align: "right" });

  return 36;
}

function drawFooter(doc: any) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(18, pageH - 12, pageW - 18, pageH - 12);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(150, 150, 150);
  doc.text("© 2026 Olimey AI · olimey.ai", 18, pageH - 7);
  doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageW - 18, pageH - 7, { align: "right" });
}

function addFootersToAllPages(doc: any) {
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(doc);
  }
}

function checkNewPage(doc: any, y: number, needed: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - 20) {
    doc.addPage();
    return 20;
  }
  return y;
}

function drawMetaRow(doc: any, y: number, label: string, value: string): number {
  const marginL = 18;
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_GREY);
  doc.text(label, marginL, y);
  doc.setTextColor(...TEXT_DARK);
  doc.setFont("helvetica", "bold");
  doc.text(value, pageW - 18, y, { align: "right" });
  return y + 6;
}

function drawSectionTitle(doc: any, y: number, title: string): number {
  const marginL = 18;
  y = checkNewPage(doc, y, 14);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND_DARK);
  doc.text(title, marginL, y);
  y += 2;
  doc.setDrawColor(...BRAND_ACCENT);
  doc.setLineWidth(0.6);
  doc.line(marginL, y, marginL + 40, y);
  return y + 6;
}

function drawDivider(doc: any, y: number): number {
  const marginL = 18;
  const pageW = doc.internal.pageSize.getWidth();
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(marginL, y, pageW - 18, y);
  return y + 4;
}

// ── Strip markdown artifacts ───────────────────────────────────────────

function stripMarkdownForPdf(text: string): string {
  return text
    .replace(/\s*\(?Ref:\s*\[Doc:.*?\]\s*\)?/g, "")
    .replace(/\s*\(?\[Doc:.*?\]\)?/g, "")
    .replace(/\s*\(Ref:\s*\)/g, "");
}

// ── Parse markdown into structured blocks ──────────────────────────────

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullet"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "hr" };

function parseMarkdownBlocks(md: string): Block[] {
  const cleaned = stripMarkdownForPdf(md);
  const lines = cleaned.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      blocks.push({ type: "heading", level: headingMatch[1].length, text: headingMatch[2].replace(/\*\*/g, "") });
      i++;
      continue;
    }

    // Table detection
    if (line.includes("|") && i + 1 < lines.length && /^\|?\s*[-:]+/.test(lines[i + 1])) {
      const parseRow = (row: string) =>
        row.split("|").map((c) => c.trim()).filter((c) => c.length > 0);
      const headers = parseRow(line);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    // Bullet
    if (/^\s*[-•*]\s+/.test(line)) {
      blocks.push({ type: "bullet", text: line.replace(/^\s*[-•*]\s+/, "").replace(/\*\*/g, "") });
      i++;
      continue;
    }

    // Numbered list item
    if (/^\s*\d+[\.)]\s+/.test(line)) {
      blocks.push({ type: "bullet", text: line.replace(/^\s*\d+[\.)]\s+/, "").replace(/\*\*/g, "") });
      i++;
      continue;
    }

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-special lines
    let para = "";
    while (i < lines.length && lines[i].trim() && !/^#{1,4}\s/.test(lines[i]) && !/^\s*[-•*]\s/.test(lines[i]) && !/^\s*\d+[\.)]\s/.test(lines[i]) && !lines[i].includes("|") && !/^[-*_]{3,}/.test(lines[i])) {
      para += (para ? " " : "") + lines[i].trim();
      i++;
    }
    if (para) {
      blocks.push({ type: "paragraph", text: para.replace(/\*\*/g, "") });
    }
  }

  return blocks;
}

// ── Render blocks to PDF ───────────────────────────────────────────────

function renderBlocks(doc: any, blocks: Block[], startY: number): number {
  const marginL = 18;
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - 36;
  let y = startY;

  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        y = checkNewPage(doc, y, 12);
        const fontSize = block.level === 1 ? 14 : block.level === 2 ? 12 : block.level === 3 ? 10.5 : 9.5;
        doc.setFontSize(fontSize);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...BRAND_DARK);

        if (block.level <= 2) {
          y += 3;
          doc.setDrawColor(...BRAND_ACCENT);
          doc.setLineWidth(0.5);
          const titleLines = doc.splitTextToSize(block.text, contentW);
          doc.text(titleLines, marginL, y);
          y += titleLines.length * (fontSize * 0.45) + 2;
          doc.line(marginL, y, marginL + Math.min(50, contentW * 0.3), y);
          y += 5;
        } else {
          const titleLines = doc.splitTextToSize(block.text, contentW);
          doc.text(titleLines, marginL, y);
          y += titleLines.length * (fontSize * 0.45) + 4;
        }
        break;
      }
      case "paragraph": {
        y = checkNewPage(doc, y, 8);
        doc.setFontSize(9.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60, 60, 60);
        const lines = doc.splitTextToSize(block.text, contentW);
        for (const line of lines) {
          y = checkNewPage(doc, y, 5);
          doc.text(line, marginL, y);
          y += 4.2;
        }
        y += 2;
        break;
      }
      case "bullet": {
        y = checkNewPage(doc, y, 6);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60, 60, 60);
        const bulletLines = doc.splitTextToSize(block.text, contentW - 8);
        doc.setFillColor(...BRAND_ACCENT);
        doc.circle(marginL + 1.5, y - 1.2, 0.8, "F");
        for (let li = 0; li < bulletLines.length; li++) {
          y = checkNewPage(doc, y, 5);
          doc.text(bulletLines[li], marginL + 6, y);
          y += 4;
        }
        y += 1;
        break;
      }
      case "table": {
        y = checkNewPage(doc, y, 20);
        const colCount = block.headers.length;
        const colW = contentW / colCount;

        // Header row
        doc.setFillColor(...BRAND_DARK);
        doc.rect(marginL, y - 4, contentW, 7, "F");
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        block.headers.forEach((h, ci) => {
          doc.text(h, marginL + ci * colW + 2, y);
        });
        y += 5;

        // Data rows
        doc.setFont("helvetica", "normal");
        block.rows.forEach((row, ri) => {
          y = checkNewPage(doc, y, 7);
          if (ri % 2 === 0) {
            doc.setFillColor(...LIGHT_BG);
            doc.rect(marginL, y - 4, contentW, 6, "F");
          }
          doc.setFontSize(8);
          doc.setTextColor(60, 60, 60);
          row.forEach((cell, ci) => {
            const cellText = doc.splitTextToSize(cell, colW - 4);
            doc.text(cellText[0] || "", marginL + ci * colW + 2, y);
          });
          y += 5;
        });
        y += 4;
        break;
      }
      case "hr": {
        y = drawDivider(doc, y);
        break;
      }
    }
  }

  return y;
}

// ── Public API ─────────────────────────────────────────────────────────

export async function generateReportPdf(options: ReportPdfOptions) {
  const doc = await createDoc();
  const metaParts = [options.caseReference, options.propertyAddress].filter(Boolean).join(" · ");
  let y = drawHeader(doc, options.title, metaParts || options.subtitle);

  // Meta section
  if (options.caseReference || options.feeEarner || options.propertyAddress) {
    y += 2;
    if (options.caseReference) y = drawMetaRow(doc, y, "Case Reference", options.caseReference);
    if (options.propertyAddress) y = drawMetaRow(doc, y, "Property", options.propertyAddress);
    if (options.feeEarner) y = drawMetaRow(doc, y, "Fee Earner", options.feeEarner);
    y += 4;
    y = drawDivider(doc, y);
  }

  // Content
  if (options.plainText) {
    const stripped = stripMarkdownForPdf(options.content)
      .replace(/\*\*/g, "")
      .replace(/^#{1,4}\s+/gm, "");
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    const contentW = doc.internal.pageSize.getWidth() - 36;
    const lines = doc.splitTextToSize(stripped, contentW);
    for (const line of lines) {
      y = checkNewPage(doc, y, 5);
      doc.text(line, 18, y);
      y += 4.2;
    }
  } else {
    const blocks = parseMarkdownBlocks(options.content);
    y = renderBlocks(doc, blocks, y);
  }

  // Disclaimer
  if (options.disclaimer) {
    y += 6;
    y = checkNewPage(doc, y, 16);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(150, 150, 150);
    const contentW = doc.internal.pageSize.getWidth() - 36;
    const lines = doc.splitTextToSize(options.disclaimer, contentW);
    doc.text(lines, 18, y);
  }

  addFootersToAllPages(doc);
  doc.save(`${(options.caseReference || options.title).replace(/\s+/g, "_")}_${options.title.replace(/\s+/g, "_")}.pdf`);
}

export async function generateRiskScorePdf(options: RiskScorePdfOptions) {
  const doc = await createDoc();
  let y = drawHeader(doc, "Risk Score Report", `${options.caseReference} · ${options.propertyAddress}`);

  y += 2;
  y = drawMetaRow(doc, y, "Case Reference", options.caseReference);
  y = drawMetaRow(doc, y, "Property", options.propertyAddress);
  y = drawMetaRow(doc, y, "Fee Earner", options.feeEarner);
  y += 4;

  // Overall score highlight
  y = drawSectionTitle(doc, y, "Overall Risk Score");
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - 36;

  doc.setFillColor(255, 247, 240);
  doc.roundedRect(18, y - 4, contentW, 20, 3, 3, "F");
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND_ACCENT);
  doc.text(`${options.totalScore}/100`, 28, y + 8);
  doc.setFontSize(12);
  doc.setTextColor(...TEXT_DARK);
  doc.text(`${options.riskLevel.charAt(0).toUpperCase() + options.riskLevel.slice(1)} Risk`, 70, y + 8);
  y += 24;

  // Score breakdown table
  y = drawSectionTitle(doc, y, "Score Breakdown");
  // Table header
  doc.setFillColor(...BRAND_DARK);
  doc.rect(18, y - 4, contentW, 7, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Category", 20, y);
  doc.text("Score", 100, y);
  doc.text("Max", 130, y);
  doc.text("% Used", pageW - 20, y, { align: "right" });
  y += 5;

  options.scores.forEach((s, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(...LIGHT_BG);
      doc.rect(18, y - 4, contentW, 6, "F");
    }
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(s.label, 20, y);
    doc.setFont("helvetica", "bold");
    doc.text(`${s.score}`, 100, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${s.max}`, 130, y);
    doc.text(`${Math.round((s.score / s.max) * 100)}%`, pageW - 20, y, { align: "right" });
    y += 6;
  });
  y += 4;

  // Top drivers
  if (options.topDrivers.length > 0) {
    y = drawSectionTitle(doc, y, "Top Risk Drivers");
    options.topDrivers.forEach((d, i) => {
      y = checkNewPage(doc, y, 12);
      doc.setFillColor(255, 247, 240);
      doc.roundedRect(18, y - 4, contentW, 10, 2, 2, "F");
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND_ACCENT);
      doc.text(`+${d.impact}`, 22, y + 2);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      const descLines = doc.splitTextToSize(d.description, contentW - 30);
      doc.text(descLines[0] || "", 36, y + 2);
      doc.setFontSize(7);
      doc.setTextColor(...TEXT_GREY);
      doc.text(d.reference, 36, y + 6);
      y += 13;
    });
  }

  // Disclaimer
  y += 6;
  y = checkNewPage(doc, y, 12);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(150, 150, 150);
  const disc = "Risk score is an internal prioritisation aid to help conveyancers focus on the most material issues. It does not constitute legal advice and should always be reviewed alongside the full AI report.";
  const discLines = doc.splitTextToSize(disc, contentW);
  doc.text(discLines, 18, y);

  addFootersToAllPages(doc);
  doc.save(`${options.caseReference}_Risk_Score.pdf`);
}

export async function generateQACheckPdf(options: QACheckPdfOptions) {
  const doc = await createDoc();
  let y = drawHeader(doc, "QA Check Report", options.caseReference);

  y += 2;
  y = drawMetaRow(doc, y, "Case Reference", options.caseReference);
  y = drawMetaRow(doc, y, "Fee Earner", options.feeEarner);
  y = drawMetaRow(doc, y, "AI Run ID", options.aiRunId);
  y = drawMetaRow(doc, y, "Result", options.pass ? (options.warn ? "PASS (with warnings)" : "PASS") : "FAIL");
  y += 4;
  y = drawDivider(doc, y);

  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - 36;

  for (const section of options.checklist) {
    y = drawSectionTitle(doc, y, section.section);

    // Table header
    doc.setFillColor(...BRAND_DARK);
    doc.rect(18, y - 4, contentW, 7, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("#", 20, y);
    doc.text("Check", 30, y);
    doc.text("Result", pageW - 20, y, { align: "right" });
    y += 5;

    section.items.forEach((item, i) => {
      y = checkNewPage(doc, y, 7);
      if (i % 2 === 0) {
        doc.setFillColor(...LIGHT_BG);
        doc.rect(18, y - 4, contentW, 6, "F");
      }
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      doc.text(String(item.id), 20, y);
      const textLines = doc.splitTextToSize(item.text, contentW - 50);
      doc.text(textLines[0] || "", 30, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(item.pass ? 34 : 220, item.pass ? 139 : 38, item.pass ? 34 : 38);
      doc.text(item.pass ? "Pass" : "Fail", pageW - 20, y, { align: "right" });
      y += 6;
    });
    y += 4;
  }

  // Summary box
  y = checkNewPage(doc, y, 18);
  const bgColor = options.pass ? [240, 253, 244] : [254, 242, 242];
  doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
  doc.roundedRect(18, y - 2, contentW, 14, 3, 3, "F");
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(options.pass ? 34 : 220, options.pass ? 139 : 38, options.pass ? 34 : 38);
  doc.text(`QA Check: ${options.pass ? "PASS" : "FAIL"}${options.warn ? " (with warnings)" : ""}`, pageW / 2, y + 7, { align: "center" });

  addFootersToAllPages(doc);
  doc.save(`${options.caseReference}_QA_Check.pdf`);
}

export async function generateAuditLogPdf(options: AuditLogPdfOptions) {
  const doc = await createDoc();
  let y = drawHeader(doc, "Audit Log", options.caseReference);

  y += 2;
  y = drawMetaRow(doc, y, "Case Reference", options.caseReference);
  y = drawMetaRow(doc, y, "Total Entries", `${options.entries.length}`);
  y += 4;

  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - 36;

  y = drawSectionTitle(doc, y, "Audit Trail");

  // Table header
  doc.setFillColor(...BRAND_DARK);
  doc.rect(18, y - 4, contentW, 7, "F");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Date/Time", 20, y);
  doc.text("Event", 60, y);
  doc.text("User", 120, y);
  doc.text("Position", pageW - 20, y, { align: "right" });
  y += 5;

  options.entries.forEach((entry, i) => {
    y = checkNewPage(doc, y, 7);
    if (i % 2 === 0) {
      doc.setFillColor(...LIGHT_BG);
      doc.rect(18, y - 4, contentW, 6, "F");
    }
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(new Date(entry.created_at).toLocaleString("en-GB"), 20, y);
    doc.text(entry.event_type, 60, y);
    doc.text(entry.user_name, 120, y);
    doc.text(entry.user_position || "", pageW - 20, y, { align: "right" });
    y += 6;
  });

  addFootersToAllPages(doc);
  doc.save(`${options.caseReference}_Audit_Log.pdf`);
}

interface PostCompletionItem {
  title: string;
  description: string;
  source_clause?: string;
  source_document?: string;
  severity: string;
  recommendation: string;
  type: string;
}

interface PostCompletionPdfOptions {
  caseReference: string;
  propertyAddress: string;
  feeEarner?: string;
  tenure: string;
  lender?: string;
  items: PostCompletionItem[];
}

export async function generatePostCompletionPdf(options: PostCompletionPdfOptions) {
  const doc = await createDoc();
  let y = drawHeader(doc, "Post-Completion Checklist", `${options.caseReference} · ${options.propertyAddress}`);

  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - 36;

  y += 2;
  y = drawMetaRow(doc, y, "Case Reference", options.caseReference);
  y = drawMetaRow(doc, y, "Property", options.propertyAddress);
  if (options.feeEarner) y = drawMetaRow(doc, y, "Fee Earner", options.feeEarner);
  y = drawMetaRow(doc, y, "Tenure", options.tenure);
  if (options.lender) y = drawMetaRow(doc, y, "Lender", options.lender);
  y = drawMetaRow(doc, y, "Generated", new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }));
  y = drawMetaRow(doc, y, "Total Items", `${options.items.length}`);
  y += 4;
  y = drawDivider(doc, y);

  y = drawSectionTitle(doc, y, "Post-Completion Actions");

  // Instruction text
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...TEXT_GREY);
  const instrLines = doc.splitTextToSize(
    "The following post-completion tasks have been identified from the title documents. Each item should be actioned within the stated deadline and signed off by the responsible person.",
    contentW
  );
  for (const line of instrLines) {
    y = checkNewPage(doc, y, 5);
    doc.text(line, 18, y);
    y += 4;
  }
  y += 4;

  options.items.forEach((item, idx) => {
    y = checkNewPage(doc, y, 40);

    // Item header bar
    const severityLabel = item.severity.charAt(0).toUpperCase() + item.severity.slice(1);
    const headerBg = item.severity === "high" ? [254, 242, 242] as const : item.severity === "medium" ? [255, 251, 235] as const : [240, 253, 244] as const;
    const headerColor = item.severity === "high" ? [220, 38, 38] as const : item.severity === "medium" ? [180, 120, 20] as const : [34, 139, 34] as const;

    doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
    doc.roundedRect(18, y - 4, contentW, 9, 2, 2, "F");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(headerColor[0], headerColor[1], headerColor[2]);
    doc.text(`${idx + 1}.`, 22, y + 2);
    doc.setTextColor(...BRAND_DARK);
    doc.text(doc.splitTextToSize(item.title, contentW - 50)[0] || item.title, 30, y + 2);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(headerColor[0], headerColor[1], headerColor[2]);
    doc.text(`[${severityLabel}]`, pageW - 20, y + 2, { align: "right" });
    y += 10;

    // Description
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    const descLines = doc.splitTextToSize(item.description, contentW - 4);
    for (const line of descLines) {
      y = checkNewPage(doc, y, 5);
      doc.text(line, 20, y);
      y += 4;
    }
    y += 1;

    // Source clause
    if (item.source_clause) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...TEXT_GREY);
      doc.text("Source: ", 20, y);
      doc.setFont("helvetica", "normal");
      const clauseText = `${item.source_document ? item.source_document + " · " : ""}${item.source_clause}`;
      doc.text(doc.splitTextToSize(clauseText, contentW - 20)[0] || clauseText, 35, y);
      y += 5;
    }

    // Recommendation
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND_DARK);
    doc.text("Action Required:", 20, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    const recLines = doc.splitTextToSize(item.recommendation, contentW - 8);
    for (const line of recLines) {
      y = checkNewPage(doc, y, 5);
      doc.text(line, 22, y);
      y += 4;
    }
    y += 2;

    // Sign-off row
    y = checkNewPage(doc, y, 12);
    doc.setFillColor(...LIGHT_BG);
    doc.roundedRect(18, y - 3, contentW, 10, 2, 2, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_GREY);
    doc.text("Completed by: ____________________", 22, y + 2);
    doc.text("Date: __ / __ / ____", pageW / 2, y + 2);
    doc.text("Signed: ____________", pageW - 60, y + 2);
    y += 14;

    // Divider between items
    if (idx < options.items.length - 1) {
      y = drawDivider(doc, y);
      y += 2;
    }
  });

  // Disclaimer
  y += 6;
  y = checkNewPage(doc, y, 16);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(150, 150, 150);
  const disc = "This checklist was generated by Olimey AI from automated analysis of case documents. It is provided as a professional assistance tool and does not constitute legal advice. The fee earner remains responsible for verifying all items and exercising independent professional judgement.";
  const discLines = doc.splitTextToSize(disc, contentW);
  doc.text(discLines, 18, y);

  addFootersToAllPages(doc);
  doc.save(`${options.caseReference}_Post_Completion_Checklist.pdf`);
}

// ── Lender-Ready SoW Export ────────────────────────────────────────────

interface LenderSoWPdfOptions {
  caseReference: string;
  propertyAddress: string;
  feeEarner: string;
  purchasePrice: string;
  mortgageAmount: string;
  tenure: string;
  lender: string;
  transactionType: string;
  purchasers: string[];
  giftors: string[];
  internalReport: string;
  /** Strips internal commentary and risk flags for lender consumption */
  redactInternalCommentary?: boolean;
}

function redactForLender(text: string): string {
  // Remove internal-only markers
  let redacted = text
    .replace(/<!-- .*? -->/g, "")
    .replace(/\*\*\[Internal Note.*?\]\*\*/gi, "")
    .replace(/\*\*\[MLRO.*?\]\*\*/gi, "")
    .replace(/⚠️\s*RAISE ENQUIRY.*$/gm, "")
    .replace(/\[Filtered by Relevance Gate.*?\]/gi, "")
    .replace(/\[Context note:.*?\]/gi, "");
  
  // Remove sections that are clearly internal
  const internalPatterns = [
    /### Internal Risk Commentary[\s\S]*?(?=###|$)/gi,
    /### MLRO Consideration[\s\S]*?(?=###|$)/gi,
    /### Fee Earner Notes[\s\S]*?(?=###|$)/gi,
  ];
  for (const pattern of internalPatterns) {
    redacted = redacted.replace(pattern, "");
  }
  
  return redacted.trim();
}

export async function generateLenderSoWPdf(options: LenderSoWPdfOptions) {
  const doc = await createDoc();
  const metaParts = [options.caseReference, options.propertyAddress].filter(Boolean).join(" · ");
  let y = drawHeader(doc, "Source of Wealth Compliance Report", metaParts);

  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - 36;

  // Cover sheet
  y += 2;
  y = drawMetaRow(doc, y, "Case Reference", options.caseReference);
  y = drawMetaRow(doc, y, "Property Address", options.propertyAddress);
  y = drawMetaRow(doc, y, "Purchase Price", `£${options.purchasePrice}`);
  if (options.mortgageAmount) y = drawMetaRow(doc, y, "Mortgage Amount", `£${options.mortgageAmount}`);
  y = drawMetaRow(doc, y, "Tenure", options.tenure || "N/A");
  y = drawMetaRow(doc, y, "Transaction Type", options.transactionType || "Purchase");
  if (options.lender) y = drawMetaRow(doc, y, "Lender", options.lender);
  y = drawMetaRow(doc, y, "Fee Earner", options.feeEarner);
  y = drawMetaRow(doc, y, "Date Generated", new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }));
  y += 4;
  y = drawDivider(doc, y);

  // Parties
  y = drawSectionTitle(doc, y, "Transaction Parties");
  if (options.purchasers.length > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEXT_DARK);
    doc.text("Purchaser(s):", 18, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    for (const name of options.purchasers) {
      doc.text(`• ${name}`, 22, y);
      y += 5;
    }
  }
  if (options.giftors.length > 0) {
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.text("Giftor(s):", 18, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    for (const name of options.giftors) {
      doc.text(`• ${name}`, 22, y);
      y += 5;
    }
  }
  y += 4;
  y = drawDivider(doc, y);

  // Compliance Report Content
  y = drawSectionTitle(doc, y, "Compliance Assessment");

  const reportContent = options.redactInternalCommentary !== false
    ? redactForLender(options.internalReport)
    : options.internalReport;

  const blocks = parseMarkdownBlocks(reportContent);
  y = renderBlocks(doc, blocks, y);

  // Professional disclaimer
  y += 8;
  y = checkNewPage(doc, y, 24);
  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(18, y - 4, contentW, 22, 3, 3, "F");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(100, 100, 100);
  const disclaimer = "This Source of Wealth compliance report has been prepared using Olimey AI-assisted analysis. The report is provided for compliance file purposes and lender review. It does not constitute legal advice. The supervising solicitor/conveyancer has reviewed the underlying evidence and AI findings. All source documents remain available for inspection upon request. The firm's compliance procedures align with the Money Laundering Regulations 2017 and the Law Society Anti-Money Laundering Practice Note.";
  const discLines = doc.splitTextToSize(disclaimer, contentW - 8);
  for (const line of discLines) {
    doc.text(line, 22, y);
    y += 3.5;
  }

  // Sign-off block
  y += 8;
  y = checkNewPage(doc, y, 30);
  y = drawSectionTitle(doc, y, "Solicitor Sign-Off");
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.text("I confirm that I have reviewed the source of wealth evidence and am satisfied", 18, y);
  y += 5;
  doc.text("that the funds are from a legitimate source.", 18, y);
  y += 12;
  
  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(18, y - 3, contentW, 10, 2, 2, "F");
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_GREY);
  doc.text("Signed: ____________________", 22, y + 2);
  doc.text("Name: ____________________", pageW / 2 - 10, y + 2);
  y += 12;
  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(18, y - 3, contentW, 10, 2, 2, "F");
  doc.text("Date: __ / __ / ____", 22, y + 2);
  doc.text("SRA ID: ____________________", pageW / 2 - 10, y + 2);

  addFootersToAllPages(doc);
  doc.save(`${options.caseReference}_SoW_Lender_Report.pdf`);
}
