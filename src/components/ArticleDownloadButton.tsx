import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ArticleDownloadButtonProps {
  title: string;
  body: string;
  category: string;
  publishedDate: string;
  readMinutes: number;
}

/** Strip markdown formatting from body text, preserving headings as uppercase labels */
function parseBody(text: string): { type: "heading" | "body" | "bullet"; text: string }[] {
  const lines = text.split("\n");
  const result: { type: "heading" | "body" | "bullet"; text: string }[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (/^#{1,6}\s+/.test(line)) {
      result.push({ type: "heading", text: line.replace(/^#{1,6}\s+/, "").replace(/\*\*(.+?)\*\*/g, "$1") });
    } else if (/^[-*]\s+/.test(line)) {
      result.push({ type: "bullet", text: line.replace(/^[-*]\s+/, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[(.+?)\]\(.+?\)/g, "$1") });
    } else {
      result.push({ type: "body", text: line.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[(.+?)\]\(.+?\)/g, "$1") });
    }
  }
  return result;
}

// Brand colors (HSL converted to RGB)
const BRAND = {
  navy: [31, 46, 65] as [number, number, number],       // primary: 220 35% 22%
  orange: [204, 102, 41] as [number, number, number],    // accent: 22 75% 50%
  warmBg: [249, 245, 240] as [number, number, number],   // background: warm cream
  textDark: [31, 41, 55] as [number, number, number],    // foreground
  textMuted: [107, 114, 128] as [number, number, number],
  borderLight: [218, 211, 200] as [number, number, number],
};

const ArticleDownloadButton = ({
  title,
  body,
  category,
  publishedDate,
  readMinutes,
}: ArticleDownloadButtonProps) => {
  const handleDownload = async () => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 22;
      const maxWidth = pageWidth - margin * 2;

      const drawPageChrome = (isFirstPage: boolean) => {
        // Top brand bar
        doc.setFillColor(...BRAND.navy);
        doc.rect(0, 0, pageWidth, 14, "F");

        // Accent stripe
        doc.setFillColor(...BRAND.orange);
        doc.rect(0, 14, pageWidth, 2, "F");

        // Left accent sidebar
        doc.setFillColor(...BRAND.orange);
        doc.rect(0, 16, 4, pageHeight - 16, "F");

        // Header text
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text("LS", margin - 4, 9.5);
        doc.setFontSize(9);
        doc.text("Olimey AI Insights", margin + 3, 9.5);

        // Right-side URL
        doc.setFontSize(7);
        doc.setTextColor(180, 190, 210);
        doc.text("olimey.ai/insights", pageWidth - margin, 9.5, { align: "right" });

        // Footer
        doc.setDrawColor(...BRAND.borderLight);
        doc.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16);
        doc.setFontSize(7);
        doc.setTextColor(...BRAND.textMuted);
        doc.text("© 2026 Olimey AI  •  All rights reserved", margin, pageHeight - 11);
        doc.text("olimey.ai", pageWidth - margin, pageHeight - 11, { align: "right" });
      };

      let y = 26;
      drawPageChrome(true);

      // Category pill
      doc.setFillColor(...BRAND.orange);
      const catText = category.toUpperCase();
      doc.setFontSize(7);
      const catWidth = doc.getTextWidth(catText) + 6;
      doc.roundedRect(margin, y - 3.5, catWidth, 5.5, 2.5, 2.5, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(catText, margin + 3, y);
      y += 10;

      // Title
      doc.setFontSize(24);
      doc.setTextColor(...BRAND.navy);
      const titleLines = doc.splitTextToSize(title, maxWidth);
      doc.text(titleLines, margin, y);
      y += titleLines.length * 10 + 4;

      // Meta line with accent divider
      doc.setFillColor(...BRAND.orange);
      doc.rect(margin, y, 30, 0.8, "F");
      y += 5;

      const dateStr = new Date(publishedDate).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      doc.setFontSize(9);
      doc.setTextColor(...BRAND.textMuted);
      doc.text(`${readMinutes} min read  •  ${dateStr}`, margin, y);
      y += 12;

      // Separator
      doc.setDrawColor(...BRAND.borderLight);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      // Body content
      const parsed = parseBody(body);

      const ensureSpace = (needed: number) => {
        if (y > pageHeight - 24 - needed) {
          doc.addPage();
          drawPageChrome(false);
          y = 24;
        }
      };

      for (const block of parsed) {
        if (block.type === "heading") {
          ensureSpace(14);
          y += 4;
          // Small orange marker before heading
          doc.setFillColor(...BRAND.orange);
          doc.rect(margin, y - 3, 1.5, 5, "F");
          doc.setFontSize(13);
          doc.setTextColor(...BRAND.navy);
          doc.text(block.text, margin + 5, y);
          y += 8;
        } else if (block.type === "bullet") {
          ensureSpace(8);
          doc.setFontSize(10);
          doc.setTextColor(...BRAND.orange);
          doc.text("▸", margin + 2, y);
          doc.setTextColor(...BRAND.textDark);
          const bulletLines = doc.splitTextToSize(block.text, maxWidth - 8);
          doc.text(bulletLines, margin + 7, y);
          y += bulletLines.length * 5 + 2;
        } else {
          const bodyLines = doc.splitTextToSize(block.text, maxWidth);
          for (const line of bodyLines) {
            ensureSpace(6);
            doc.setFontSize(10);
            doc.setTextColor(...BRAND.textDark);
            doc.text(line, margin, y);
            y += 5;
          }
          y += 2;
        }
      }

      // CTA box at the end
      ensureSpace(30);
      y += 6;
      doc.setFillColor(240, 237, 232);
      doc.roundedRect(margin, y, maxWidth, 22, 3, 3, "F");
      doc.setFillColor(...BRAND.orange);
      doc.roundedRect(margin, y, maxWidth, 1, 0, 0, "F");

      doc.setFontSize(10);
      doc.setTextColor(...BRAND.navy);
      doc.text("Ready to transform your conveyancing workflow?", margin + 6, y + 8);
      doc.setFontSize(8);
      doc.setTextColor(...BRAND.textMuted);
      doc.text("Start your free trial at olimey.ai/free-trial — 100 credits, no card required.", margin + 6, y + 14);

      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 60);
      doc.save(`${slug}.pdf`);
      toast.success("Article downloaded as PDF");
    } catch (e) {
      console.error("PDF error:", e);
      toast.error("Failed to generate PDF");
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownload}
      className="gap-1.5 text-xs border-border hover:border-accent/30"
    >
      <Download size={14} />
      Download
    </Button>
  );
};

export default ArticleDownloadButton;
