import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType,
  ShadingType,
} from "docx";
import { saveAs } from "file-saver";

// ── Brand constants ────────────────────────────────────────────────────
const FONT = "Calibri";
const BODY_SIZE = 22; // 11pt in half-points
const SMALL_SIZE = 18; // 9pt
const LINE_SPACING = 260; // slightly more than single for readability
const BRAND_COLOR = "1B3A4B"; // dark teal
const ACCENT_COLOR = "D4A853"; // gold
const MUTED_COLOR = "888888";
const RED_COLOR = "CC0000";
const AMBER_COLOR = "CC8800";
const GREEN_COLOR = "228B22";

/** Default document styles */
const defaultStyles = {
  default: {
    document: {
      run: { font: FONT, size: BODY_SIZE },
      paragraph: { spacing: { line: LINE_SPACING, after: 60 } },
    },
    heading1: {
      run: { font: FONT, size: 36, bold: true, color: BRAND_COLOR },
      paragraph: { spacing: { line: LINE_SPACING, after: 160 } },
    },
    heading2: {
      run: { font: FONT, size: 28, bold: true, color: BRAND_COLOR },
      paragraph: { spacing: { line: LINE_SPACING, before: 240, after: 100 } },
    },
    heading3: {
      run: { font: FONT, size: 24, bold: true, color: BRAND_COLOR },
      paragraph: { spacing: { line: LINE_SPACING, before: 200, after: 80 } },
    },
    heading4: {
      run: { font: FONT, size: 22, bold: true, color: BRAND_COLOR },
      paragraph: { spacing: { line: LINE_SPACING, before: 160, after: 60 } },
    },
  },
};

/** Numbering configuration for ordered lists */
const defaultNumbering = {
  config: [
    {
      reference: "default-numbering",
      levels: [
        {
          level: 0,
          format: "decimal" as const,
          text: "%1.",
          alignment: AlignmentType.START,
          style: { run: { font: FONT, size: BODY_SIZE } },
        },
      ],
    },
  ],
};

// ── Helpers ─────────────────────────────────────────────────────────────

function p(text: string, opts?: Record<string, any>) {
  return new Paragraph({ text, spacing: { line: LINE_SPACING, after: 60 }, ...(opts || {}) });
}

function emptyLine() {
  return new Paragraph({ spacing: { line: LINE_SPACING, after: 0 }, children: [] });
}

function labelValue(label: string, value: string) {
  return new Paragraph({
    children: [
      new TextRun({ text: label, bold: true, font: FONT, size: BODY_SIZE, color: BRAND_COLOR }),
      new TextRun({ text: value, font: FONT, size: BODY_SIZE }),
    ],
    spacing: { line: LINE_SPACING, after: 40 },
  });
}

function goldDivider() {
  return new Paragraph({
    children: [new TextRun({ text: "━".repeat(60), font: FONT, size: 16, color: ACCENT_COLOR })],
    alignment: AlignmentType.CENTER,
    spacing: { line: LINE_SPACING, after: 120 },
  });
}

function sectionHeader(sectionNum: number, title: string): Paragraph[] {
  return [
    new Paragraph({
      children: [
        new TextRun({ text: `Section ${sectionNum}`, font: FONT, size: 18, color: ACCENT_COLOR, bold: true }),
      ],
      spacing: { line: LINE_SPACING, after: 40 },
    }),
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [new TextRun({ text: "━".repeat(60), font: FONT, size: 16, color: ACCENT_COLOR })],
      spacing: { line: LINE_SPACING, after: 140 },
    }),
  ];
}

function buildInfoRow(label: string, value: string): TableRow[] {
  const noBorderSide = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const bottomBorder = { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" };
  return [
    new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: label, bold: true, font: FONT, size: BODY_SIZE, color: BRAND_COLOR })],
            spacing: { line: LINE_SPACING, after: 20 },
          })],
          width: { size: 35, type: WidthType.PERCENTAGE },
          borders: { top: noBorderSide, bottom: bottomBorder, left: noBorderSide, right: noBorderSide },
        }),
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: value, font: FONT, size: BODY_SIZE })],
            spacing: { line: LINE_SPACING, after: 20 },
          })],
          width: { size: 65, type: WidthType.PERCENTAGE },
          borders: { top: noBorderSide, bottom: bottomBorder, left: noBorderSide, right: noBorderSide },
        }),
      ],
    }),
  ];
}

function disclaimerParagraph(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: 16, italics: true, color: MUTED_COLOR })],
    alignment: AlignmentType.CENTER,
    spacing: { line: LINE_SPACING, after: 40 },
  });
}

function signOffSection(): Paragraph[] {
  const underline = "____________________________";
  return [
    emptyLine(),
    new Paragraph({
      children: [new TextRun({ text: "━".repeat(60), font: FONT, size: 16, color: ACCENT_COLOR })],
      spacing: { line: LINE_SPACING, before: 200, after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "COMPLIANCE OFFICER SIGN-OFF", font: FONT, size: 22, bold: true, color: BRAND_COLOR })],
      spacing: { line: LINE_SPACING, after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Reviewed By:  ", bold: true, font: FONT, size: BODY_SIZE, color: MUTED_COLOR }),
        new TextRun({ text: underline, font: FONT, size: BODY_SIZE, color: MUTED_COLOR }),
        new TextRun({ text: "          Date:  ", bold: true, font: FONT, size: BODY_SIZE, color: MUTED_COLOR }),
        new TextRun({ text: underline, font: FONT, size: BODY_SIZE, color: MUTED_COLOR }),
      ],
      spacing: { line: LINE_SPACING, after: 80 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Position:  ", bold: true, font: FONT, size: BODY_SIZE, color: MUTED_COLOR }),
        new TextRun({ text: underline, font: FONT, size: BODY_SIZE, color: MUTED_COLOR }),
        new TextRun({ text: "          Signature:  ", bold: true, font: FONT, size: BODY_SIZE, color: MUTED_COLOR }),
        new TextRun({ text: underline, font: FONT, size: BODY_SIZE, color: MUTED_COLOR }),
      ],
      spacing: { line: LINE_SPACING, after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: "I confirm that I have reviewed this assessment and am satisfied with the conclusions and recommendations set out herein, subject to the resolution of any outstanding enquiries.",
        font: FONT, size: SMALL_SIZE, italics: true, color: MUTED_COLOR,
      })],
      spacing: { line: LINE_SPACING, after: 40 },
    }),
  ];
}

// ── Enhanced markdown parser ────────────────────────────────────────────

/**
 * Parse inline markdown formatting into TextRun children.
 * Handles **bold**, *italic*, ✅/⚠️/❌ emoji colorization, and [links](url).
 */
function parseInlineFormatting(text: string, baseSize = BODY_SIZE): TextRun[] {
  const runs: TextRun[] = [];
  // Split by bold markers first
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
  
  for (const part of boldParts) {
    if (!part) continue;
    const boldMatch = part.match(/^\*\*(.+)\*\*$/);
    if (boldMatch) {
      const inner = boldMatch[1];
      // Check for severity indicators in bold text
      if (/critical|red|high\s*risk/i.test(inner)) {
        runs.push(new TextRun({ text: inner, bold: true, font: FONT, size: baseSize, color: RED_COLOR }));
      } else if (/amber|medium|warning/i.test(inner)) {
        runs.push(new TextRun({ text: inner, bold: true, font: FONT, size: baseSize, color: AMBER_COLOR }));
      } else if (/green|low\s*risk|pass/i.test(inner)) {
        runs.push(new TextRun({ text: inner, bold: true, font: FONT, size: baseSize, color: GREEN_COLOR }));
      } else {
        runs.push(new TextRun({ text: inner, bold: true, font: FONT, size: baseSize }));
      }
    } else {
      // Handle italic within non-bold text
      const italicParts = part.split(/(\*[^*]+\*)/g);
      for (const iPart of italicParts) {
        if (!iPart) continue;
        const italicMatch = iPart.match(/^\*(.+)\*$/);
        if (italicMatch) {
          runs.push(new TextRun({ text: italicMatch[1], italics: true, font: FONT, size: baseSize }));
        } else {
          // Colorize status emojis
          let processed = iPart;
          if (processed.includes("✅")) {
            const segments = processed.split("✅");
            segments.forEach((seg, i) => {
              if (i > 0) runs.push(new TextRun({ text: "✅ ", font: FONT, size: baseSize, color: GREEN_COLOR }));
              if (seg) runs.push(new TextRun({ text: seg, font: FONT, size: baseSize }));
            });
          } else if (processed.includes("⚠️")) {
            const segments = processed.split("⚠️");
            segments.forEach((seg, i) => {
              if (i > 0) runs.push(new TextRun({ text: "⚠️ ", font: FONT, size: baseSize, color: AMBER_COLOR }));
              if (seg) runs.push(new TextRun({ text: seg, font: FONT, size: baseSize }));
            });
          } else if (processed.includes("❌")) {
            const segments = processed.split("❌");
            segments.forEach((seg, i) => {
              if (i > 0) runs.push(new TextRun({ text: "❌ ", font: FONT, size: baseSize, color: RED_COLOR }));
              if (seg) runs.push(new TextRun({ text: seg, font: FONT, size: baseSize }));
            });
          } else {
            // Strip markdown links: [text](url) → text
            const linkStripped = processed.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
            if (linkStripped) runs.push(new TextRun({ text: linkStripped, font: FONT, size: baseSize }));
          }
        }
      }
    }
  }
  
  return runs.length > 0 ? runs : [new TextRun({ text: text, font: FONT, size: baseSize })];
}

/**
 * Parse a markdown table block into a docx Table.
 */
function parseMarkdownTable(lines: string[]): Table | null {
  if (lines.length < 2) return null;
  
  const parseRow = (line: string) =>
    line.split("|").map(c => c.trim()).filter(c => c !== "");
  
  const headerCells = parseRow(lines[0]);
  if (headerCells.length === 0) return null;
  
  // Skip separator line (line[1])
  const dataLines = lines.slice(2);
  const colWidth = Math.floor(100 / headerCells.length);
  
  const headerBorders = {
    top: { style: BorderStyle.SINGLE, size: 1, color: BRAND_COLOR },
    bottom: { style: BorderStyle.SINGLE, size: 2, color: BRAND_COLOR },
    left: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
    right: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
  };
  
  const cellBorders = {
    top: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
    left: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
    right: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
  };

  const rows = [
    new TableRow({
      tableHeader: true,
      children: headerCells.map(cell =>
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: cell, bold: true, font: FONT, size: SMALL_SIZE, color: "FFFFFF" })],
            spacing: { line: LINE_SPACING, after: 20 },
          })],
          width: { size: colWidth, type: WidthType.PERCENTAGE },
          borders: headerBorders,
          shading: { type: ShadingType.SOLID, color: BRAND_COLOR, fill: BRAND_COLOR },
        })
      ),
    }),
    ...dataLines.filter(l => l.includes("|")).map(line => {
      const cells = parseRow(line);
      return new TableRow({
        children: headerCells.map((_, i) =>
          new TableCell({
            children: [new Paragraph({
              children: parseInlineFormatting(cells[i] || "", SMALL_SIZE),
              spacing: { line: LINE_SPACING, after: 20 },
            })],
            width: { size: colWidth, type: WidthType.PERCENTAGE },
            borders: cellBorders,
          })
        ),
      });
    }),
  ];

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

/**
 * Enhanced markdown-to-paragraphs converter.
 * Handles headings, bold/italic, bullet points, numbered lists, tables,
 * horizontal rules, and status indicators with proper formatting.
 */
function markdownToParagraphs(text: string, stripDocRefs = false): Paragraph[] {
  let cleaned = text;
  if (stripDocRefs) {
    cleaned = cleaned.replace(/\s*\(?\[Doc:.*?\]\)?/g, "");
  }
  // Strip hidden markers
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");

  const lines = cleaned.split("\n");
  const paragraphs: Paragraph[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headings
    const h1 = line.match(/^#\s+(.*)/);
    const h2 = line.match(/^##\s+(.*)/);
    const h3 = line.match(/^###\s+(.*)/);
    const h4 = line.match(/^####\s+(.*)/);
    if (h1) { paragraphs.push(new Paragraph({ text: h1[1].replace(/\*\*/g, ""), heading: HeadingLevel.HEADING_1 })); i++; continue; }
    if (h2) { paragraphs.push(new Paragraph({ text: h2[1].replace(/\*\*/g, ""), heading: HeadingLevel.HEADING_2 })); i++; continue; }
    if (h3) { paragraphs.push(new Paragraph({ text: h3[1].replace(/\*\*/g, ""), heading: HeadingLevel.HEADING_3 })); i++; continue; }
    if (h4) { paragraphs.push(new Paragraph({ text: h4[1].replace(/\*\*/g, ""), heading: HeadingLevel.HEADING_4 })); i++; continue; }

    // Horizontal rules
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      paragraphs.push(goldDivider());
      i++; continue;
    }

    // Tables — collect consecutive lines containing |
    if (line.includes("|") && line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const table = parseMarkdownTable(tableLines);
      if (table) {
        paragraphs.push(emptyLine());
        paragraphs.push(new Paragraph({ children: [] })); // Tables need to be at top level
        // We'll use a workaround: wrap table rows into a standalone paragraph won't work
        // Instead we push a placeholder and handle tables separately
        // Actually docx-js supports tables as children alongside paragraphs
        (paragraphs as any).push(table);
        paragraphs.push(emptyLine());
      }
      continue;
    }

    // Bullet points
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)/);
    if (bulletMatch) {
      const level = Math.min(Math.floor((bulletMatch[1]?.length || 0) / 2), 3);
      paragraphs.push(new Paragraph({
        children: parseInlineFormatting(bulletMatch[2]),
        bullet: { level },
        spacing: { line: LINE_SPACING, after: 40 },
      }));
      i++; continue;
    }

    // Numbered lists
    const numMatch = line.match(/^(\s*)\d+\.\s+(.*)/);
    if (numMatch) {
      paragraphs.push(new Paragraph({
        children: parseInlineFormatting(numMatch[2]),
        numbering: { reference: "default-numbering", level: 0 },
        spacing: { line: LINE_SPACING, after: 40 },
      }));
      i++; continue;
    }

    // Empty lines
    if (line.trim() === "") {
      paragraphs.push(emptyLine());
      i++; continue;
    }

    // Regular paragraph with inline formatting
    paragraphs.push(new Paragraph({
      children: parseInlineFormatting(line),
      spacing: { line: LINE_SPACING, after: 60 },
    }));
    i++;
  }

  return paragraphs;
}

// ── Cover page builder ──────────────────────────────────────────────────

interface CoverPageData {
  title: string;
  subtitle: string;
  caseReference: string;
  propertyAddress: string;
  conveyancer: string;
  generatedAt?: string;
  transactionType?: string;
  propertyType?: string;
  tenure?: string;
  purchasePrice?: string;
  lender?: string;
  stampDuty?: string;
  legalFees?: string;
  mortgageAmount?: string;
  purchasers?: string[];
  giftors?: string[];
  runId?: string;
}

function buildCoverPage(data: CoverPageData) {
  const now = data.generatedAt || new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });

  const infoRows: TableRow[] = [
    ...buildInfoRow("File Reference", data.caseReference),
    ...buildInfoRow("Property Address", data.propertyAddress),
    ...(data.transactionType ? buildInfoRow("Transaction Type", data.transactionType) : []),
    ...(data.propertyType ? buildInfoRow("Property Type", data.propertyType) : []),
    ...(data.tenure ? buildInfoRow("Tenure", data.tenure) : []),
    ...(data.purchasePrice ? buildInfoRow("Purchase Price", `£${data.purchasePrice}`) : []),
    ...(data.mortgageAmount ? buildInfoRow("Mortgage Amount", `£${data.mortgageAmount}`) : []),
    ...(data.lender ? buildInfoRow("Lender", data.lender) : []),
    ...(data.stampDuty ? buildInfoRow("Stamp Duty (SDLT)", `£${data.stampDuty}`) : []),
    ...(data.legalFees ? buildInfoRow("Legal Fees", `£${data.legalFees}`) : []),
    ...(data.purchasers && data.purchasers.length > 0 ? buildInfoRow("Purchaser(s)", data.purchasers.join(", ")) : []),
    ...(data.giftors && data.giftors.length > 0 ? buildInfoRow("Giftor(s)", data.giftors.join(", ")) : []),
    ...buildInfoRow("Prepared By", data.conveyancer),
    ...buildInfoRow("Report Generated", now),
    ...(data.runId ? buildInfoRow("Analysis Run ID", data.runId) : []),
  ];

  return {
    properties: {},
    children: [
      // Top accent bars
      new Paragraph({
        children: [new TextRun({ text: "━".repeat(80), font: FONT, size: 8, color: BRAND_COLOR })],
        spacing: { line: LINE_SPACING, after: 20 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "━".repeat(20), font: FONT, size: 6, color: ACCENT_COLOR })],
        spacing: { line: LINE_SPACING, after: 0 },
      }),
      // Spacer
      emptyLine(), emptyLine(), emptyLine(), emptyLine(),
      // Brand title
      new Paragraph({
        children: [new TextRun({ text: "Olimey AI", font: FONT, size: 56, bold: true, color: BRAND_COLOR })],
        alignment: AlignmentType.CENTER,
        spacing: { line: LINE_SPACING, after: 40 },
      }),
      new Paragraph({
        children: [new TextRun({ text: `${data.title} — ${data.subtitle}`, font: FONT, size: 28, color: ACCENT_COLOR })],
        alignment: AlignmentType.CENTER,
        spacing: { line: LINE_SPACING, after: 200 },
      }),
      goldDivider(),
      emptyLine(),
      // Transaction info table
      new Table({ width: { size: 80, type: WidthType.PERCENTAGE }, rows: infoRows }),
      emptyLine(), emptyLine(), emptyLine(),
      // Confidentiality notice
      new Paragraph({
        children: [new TextRun({ text: "CONFIDENTIAL — FOR INTERNAL COMPLIANCE USE ONLY", font: FONT, size: SMALL_SIZE, bold: true, color: MUTED_COLOR })],
        alignment: AlignmentType.CENTER,
        spacing: { line: LINE_SPACING, after: 40 },
      }),
      disclaimerParagraph("This report is a professional assistance tool generated by Olimey AI and does not constitute legal advice."),
    ],
  };
}

// ── Export functions ─────────────────────────────────────────────────────

interface RiskExportData {
  caseReference: string;
  propertyAddress: string;
  feeEarner: string;
  totalScore: number;
  riskLevel: string;
  scores: { label: string; score: number; max: number }[];
  topDrivers: { description: string; reference: string; impact: number }[];
}

export async function exportRiskReport(data: RiskExportData) {
  const riskColor = data.riskLevel === "high" ? RED_COLOR : data.riskLevel === "medium" ? AMBER_COLOR : GREEN_COLOR;
  const doc = new Document({
    styles: defaultStyles,
    numbering: defaultNumbering,
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: "Olimey AI — Risk Score Report", heading: HeadingLevel.HEADING_1 }),
        labelValue("Case: ", data.caseReference),
        labelValue("Property: ", data.propertyAddress),
        labelValue("Conveyancer: ", data.feeEarner),
        new Paragraph({
          children: [
            new TextRun({ text: "Overall Score: ", bold: true, font: FONT }),
            new TextRun({ text: `${data.totalScore}/100`, bold: true, font: FONT, color: riskColor }),
            new TextRun({ text: `  (${data.riskLevel.charAt(0).toUpperCase() + data.riskLevel.slice(1)})`, font: FONT, color: riskColor }),
          ],
          spacing: { line: LINE_SPACING, after: 200 },
        }),
        new Paragraph({ text: "Score Breakdown", heading: HeadingLevel.HEADING_2 }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: "Category", bold: true, font: FONT, color: "FFFFFF" })] })],
                  width: { size: 60, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.SOLID, color: BRAND_COLOR, fill: BRAND_COLOR },
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: "Score", bold: true, font: FONT, color: "FFFFFF" })], alignment: AlignmentType.RIGHT })],
                  width: { size: 20, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.SOLID, color: BRAND_COLOR, fill: BRAND_COLOR },
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: "Max", bold: true, font: FONT, color: "FFFFFF" })], alignment: AlignmentType.RIGHT })],
                  width: { size: 20, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.SOLID, color: BRAND_COLOR, fill: BRAND_COLOR },
                }),
              ],
            }),
            ...data.scores.map(s =>
              new TableRow({
                children: [
                  new TableCell({ children: [p(s.label)] }),
                  new TableCell({ children: [p(String(s.score), { alignment: AlignmentType.RIGHT })] }),
                  new TableCell({ children: [p(String(s.max), { alignment: AlignmentType.RIGHT })] }),
                ],
              })
            ),
          ],
        }),
        emptyLine(),
        new Paragraph({ text: "Top Risk Drivers", heading: HeadingLevel.HEADING_2 }),
        ...data.topDrivers.map(d =>
          new Paragraph({
            children: [
              new TextRun({ text: `+${d.impact}  `, bold: true, font: FONT, color: RED_COLOR }),
              new TextRun({ text: d.description, font: FONT }),
              new TextRun({ text: `  [${d.reference}]`, italics: true, color: MUTED_COLOR, font: FONT }),
            ],
            spacing: { line: LINE_SPACING, after: 60 },
            bullet: { level: 0 },
          })
        ),
        ...signOffSection(),
        disclaimerParagraph("This score is an internal prioritisation aid and does not constitute legal advice."),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${data.caseReference}-risk-report.docx`);
}

export async function exportDraftEmail(caseReference: string, emailBody: string) {
  const hasVisibleOutsideUK = /outside-uk\s*\/\s*jurisdiction enquiry|cayman|outside the uk/i.test(emailBody);
  const hasVisibleTransferTrail = /transfer-trail enquiry|transfer chain|purchase funds/i.test(emailBody);
  const hasVisibleSharedParty = /shared-party\s*\/\s*cross-party funding enquiry|confirmation of source of funds\s*—|anna[\s\S]{0,160}derived from|cross-party funding/i.test(emailBody);
  const bodyHash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(16); };
  console.log(`[RULE-FIRE-PROOF][export] caseRef=${caseReference} stage=exported_docx | email_chars=${emailBody.length} email_hash=${bodyHash(emailBody)} | outsideUK_present=${hasVisibleOutsideUK} transferTrail_present=${hasVisibleTransferTrail} sharedParty_present=${hasVisibleSharedParty} | preview="${emailBody.slice(0, 200)}…"`);
  const paragraphs = markdownToParagraphs(emailBody, true);
  const doc = new Document({
    styles: defaultStyles,
    numbering: defaultNumbering,
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: "Draft Email to the Client", heading: HeadingLevel.HEADING_1 }),
        labelValue("Case: ", caseReference),
        emptyLine(),
        ...paragraphs,
      ],
    }],
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${caseReference}-draft-email.docx`);
}

export async function exportClientReport(caseReference: string, propertyAddress: string, feeEarner: string, runId: string, reportMarkdown: string) {
  const paragraphs = markdownToParagraphs(reportMarkdown);
  const doc = new Document({
    styles: defaultStyles,
    numbering: defaultNumbering,
    sections: [
      buildCoverPage({
        title: "Olimey AI",
        subtitle: "Client Report",
        caseReference,
        propertyAddress,
        conveyancer: feeEarner,
        runId,
      }),
      {
        properties: {},
        children: [
          ...sectionHeader(1, "Client Report"),
          ...paragraphs,
          ...signOffSection(),
          emptyLine(),
          disclaimerParagraph("This report is for information purposes only and does not constitute legal advice."),
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${caseReference}-client-report.docx`);
}

export async function exportInternalReport(caseReference: string, feeEarner: string, runId: string, reportMarkdown: string) {
  const paragraphs = markdownToParagraphs(reportMarkdown);
  const doc = new Document({
    styles: defaultStyles,
    numbering: defaultNumbering,
    sections: [
      buildCoverPage({
        title: "Olimey AI",
        subtitle: "Internal Compliance Report",
        caseReference,
        propertyAddress: "",
        conveyancer: feeEarner,
        runId,
      }),
      {
        properties: {},
        children: [
          ...sectionHeader(1, "Internal Compliance Report"),
          ...paragraphs,
          ...signOffSection(),
          emptyLine(),
          disclaimerParagraph("End of Report — Generated by Olimey AI"),
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${caseReference}-internal-report.docx`);
}

// ── Post-completion & combined exports ──────────────────────────────────

interface PostCompletionItem {
  severity: string;
  title: string;
  description: string;
  source_document?: string;
  source_clause?: string;
  recommendation: string;
  lender_impact?: string;
}

interface ExportAllData {
  caseReference: string;
  propertyAddress: string;
  feeEarner: string;
  runId: string;
  riskScore?: {
    totalScore: number;
    riskLevel: string;
    scores: { label: string; score: number; max: number }[];
    topDrivers: { description: string; reference: string; impact: number }[];
  };
  internalReport?: string;
  clientReport?: string;
  draftEmail?: string;
  sowAssessment?: string;
  sowInternalReport?: string;
  sowDraftEmail?: string;
  postCompletionItems?: PostCompletionItem[];
}

export async function exportAllReports(data: ExportAllData) {
  let sectionNum = 0;
  const sections: any[] = [
    buildCoverPage({
      title: "Olimey AI",
      subtitle: "Combined Report Pack",
      caseReference: data.caseReference,
      propertyAddress: data.propertyAddress,
      conveyancer: data.feeEarner,
      runId: data.runId,
    }),
  ];

  if (data.riskScore) {
    sectionNum++;
    const riskColor = data.riskScore.riskLevel === "high" ? RED_COLOR : data.riskScore.riskLevel === "medium" ? AMBER_COLOR : GREEN_COLOR;
    sections.push({
      properties: {},
      children: [
        ...sectionHeader(sectionNum, "Risk Score Breakdown"),
        new Paragraph({
          children: [
            new TextRun({ text: "Overall Score: ", bold: true, font: FONT }),
            new TextRun({ text: `${data.riskScore.totalScore}/100`, bold: true, font: FONT, color: riskColor }),
            new TextRun({ text: `  (${data.riskScore.riskLevel.charAt(0).toUpperCase() + data.riskScore.riskLevel.slice(1)})`, font: FONT, color: riskColor }),
          ],
          spacing: { line: LINE_SPACING, after: 120 },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: ["Category", "Score", "Max"].map((t, idx) =>
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, font: FONT, color: "FFFFFF" })], alignment: idx > 0 ? AlignmentType.RIGHT : undefined })],
                  width: { size: idx === 0 ? 60 : 20, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.SOLID, color: BRAND_COLOR, fill: BRAND_COLOR },
                })
              ),
            }),
            ...data.riskScore.scores.map(s =>
              new TableRow({
                children: [
                  new TableCell({ children: [p(s.label)] }),
                  new TableCell({ children: [p(String(s.score), { alignment: AlignmentType.RIGHT })] }),
                  new TableCell({ children: [p(String(s.max), { alignment: AlignmentType.RIGHT })] }),
                ],
              })
            ),
          ],
        }),
        emptyLine(),
        new Paragraph({ text: "Top Risk Drivers", heading: HeadingLevel.HEADING_3 }),
        ...data.riskScore.topDrivers.map(d =>
          new Paragraph({
            children: [
              new TextRun({ text: `+${d.impact}  `, bold: true, font: FONT, color: RED_COLOR }),
              new TextRun({ text: d.description, font: FONT }),
              new TextRun({ text: `  [${d.reference}]`, italics: true, color: MUTED_COLOR, font: FONT }),
            ],
            spacing: { line: LINE_SPACING, after: 60 },
            bullet: { level: 0 },
          })
        ),
      ],
    });
  }

  if (data.internalReport) {
    sectionNum++;
    sections.push({ properties: {}, children: [...sectionHeader(sectionNum, "Compliance Summary"), ...markdownToParagraphs(data.internalReport)] });
  }

  if (data.clientReport) {
    sectionNum++;
    sections.push({ properties: {}, children: [...sectionHeader(sectionNum, "Client Report"), ...markdownToParagraphs(data.clientReport)] });
  }

  if (data.draftEmail) {
    sectionNum++;
    sections.push({ properties: {}, children: [...sectionHeader(sectionNum, "Draft Email to the Client"), ...markdownToParagraphs(data.draftEmail, true)] });
  }

  if (data.sowAssessment) {
    sectionNum++;
    sections.push({ properties: {}, children: [...sectionHeader(sectionNum, "Source of Wealth Assessment"), ...markdownToParagraphs(data.sowAssessment)] });
  }

  if (data.sowInternalReport) {
    sectionNum++;
    sections.push({ properties: {}, children: [...sectionHeader(sectionNum, "SoW Internal Compliance Report"), ...markdownToParagraphs(data.sowInternalReport)] });
  }

  if (data.sowDraftEmail) {
    sectionNum++;
    sections.push({ properties: {}, children: [...sectionHeader(sectionNum, "SoW Client Enquiries Email"), ...markdownToParagraphs(data.sowDraftEmail, true)] });
  }

  if (data.postCompletionItems && data.postCompletionItems.length > 0) {
    sectionNum++;
    const SEVERITY_LABEL: Record<string, string> = { high: "HIGH", medium: "MEDIUM", low: "LOW" };
    const SEVERITY_COLOR: Record<string, string> = { high: RED_COLOR, medium: AMBER_COLOR, low: GREEN_COLOR };
    const itemRows = data.postCompletionItems.map((item, idx) => {
      const children: Paragraph[] = [
        new Paragraph({
          children: [
            new TextRun({ text: `${idx + 1}. `, bold: true, font: FONT, size: BODY_SIZE }),
            new TextRun({ text: item.title, bold: true, font: FONT, size: BODY_SIZE }),
            new TextRun({ text: `  [${SEVERITY_LABEL[item.severity] || item.severity}]`, font: FONT, size: SMALL_SIZE, color: SEVERITY_COLOR[item.severity] || MUTED_COLOR }),
          ],
          spacing: { line: LINE_SPACING, after: 40 },
        }),
        new Paragraph({ children: parseInlineFormatting(item.description), spacing: { line: LINE_SPACING, after: 40 } }),
      ];
      if (item.source_clause) {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: "Source: ", bold: true, font: FONT, size: SMALL_SIZE }),
            new TextRun({ text: `${item.source_document || "—"} · ${item.source_clause}`, font: FONT, size: SMALL_SIZE, color: "666666" }),
          ],
          spacing: { line: LINE_SPACING, after: 40 },
        }));
      }
      children.push(new Paragraph({
        children: [
          new TextRun({ text: "Action: ", bold: true, font: FONT, size: BODY_SIZE }),
          new TextRun({ text: item.recommendation, font: FONT, size: BODY_SIZE }),
        ],
        spacing: { line: LINE_SPACING, after: 40 },
      }));
      if (item.lender_impact) {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: "Lender impact: ", bold: true, font: FONT, size: SMALL_SIZE, italics: true }),
            new TextRun({ text: item.lender_impact, font: FONT, size: SMALL_SIZE, italics: true, color: "666666" }),
          ],
          spacing: { line: LINE_SPACING, after: 40 },
        }));
      }
      children.push(new Paragraph({
        children: [
          new TextRun({ text: "Completed by: ________________   Date: ________________   Signed: ________________", font: FONT, size: SMALL_SIZE, color: MUTED_COLOR }),
        ],
        spacing: { line: LINE_SPACING, after: 120 },
      }));
      return children;
    });

    sections.push({
      properties: {},
      children: [
        ...sectionHeader(sectionNum, "Post-Completion Checklist"),
        p(`${data.postCompletionItems.length} item${data.postCompletionItems.length !== 1 ? "s" : ""} requiring post-completion action.`),
        emptyLine(),
        ...itemRows.flat(),
      ],
    });
  }

  // Final sign-off on the last section
  const lastSection = sections[sections.length - 1];
  if (lastSection?.children) {
    lastSection.children.push(
      ...signOffSection(),
      emptyLine(),
      disclaimerParagraph("End of Report — Generated by Olimey AI"),
    );
  }

  const doc = new Document({ styles: defaultStyles, numbering: defaultNumbering, sections });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${data.caseReference}-full-report.docx`);
}




/** Export all SoW sections as a single branded DOCX */
export async function exportSoWAll(data: {
  caseReference: string;
  propertyAddress: string;
  conveyancer: string;
  assessment: string;
  internalReport: string;
  draftEmail: string;
  transactionType?: string;
  propertyType?: string;
  tenure?: string;
  purchasePrice?: string;
  lender?: string;
  stampDuty?: string;
  legalFees?: string;
  mortgageAmount?: string;
  purchasers?: string[];
  giftors?: string[];
  generatedAt?: string;
}) {
  const sections: any[] = [
    buildCoverPage({
      title: "Olimey AI",
      subtitle: "Source of Wealth Report",
      caseReference: data.caseReference,
      propertyAddress: data.propertyAddress,
      conveyancer: data.conveyancer,
      generatedAt: data.generatedAt,
      transactionType: data.transactionType,
      propertyType: data.propertyType,
      tenure: data.tenure,
      purchasePrice: data.purchasePrice,
      lender: data.lender,
      stampDuty: data.stampDuty,
      legalFees: data.legalFees,
      mortgageAmount: data.mortgageAmount,
      purchasers: data.purchasers,
      giftors: data.giftors,
    }),
  ];

  let sectionNum = 0;

  if (data.assessment) {
    sectionNum++;
    sections.push({
      properties: {},
      children: [...sectionHeader(sectionNum, "Source of Wealth Assessment"), ...markdownToParagraphs(data.assessment)],
    });
  }

  if (data.internalReport) {
    sectionNum++;
    sections.push({
      properties: {},
      children: [...sectionHeader(sectionNum, "Internal Compliance Report"), ...markdownToParagraphs(data.internalReport)],
    });
  }

  if (data.draftEmail) {
    sectionNum++;
    sections.push({
      properties: {},
      children: [
        ...sectionHeader(sectionNum, "Client Enquiries Email"),
        ...markdownToParagraphs(data.draftEmail, true),
        ...signOffSection(),
        emptyLine(),
        goldDivider(),
        disclaimerParagraph("End of Report — Generated by Olimey AI"),
      ],
    });
  }

  const doc = new Document({ styles: defaultStyles, numbering: defaultNumbering, sections });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${data.caseReference}-sow-full-report.docx`);
}
