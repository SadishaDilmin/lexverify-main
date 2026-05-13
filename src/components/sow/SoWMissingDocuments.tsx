import { useRef } from "react";
import { Upload, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface MissingDocItem {
  label: string;
  category: string;
  context: string;
  severity?: "warning" | "info";
}

/**
 * Enhanced parser: extracts missing document references with richer context.
 * Returns objects with label, category (for prompt routing), and context (why needed).
 */
interface MissingDocParseOptions {
  evidenceFileNames?: string[];
}

const POSITIVE_SIGNAL_WORDS = "provided|supplied|uploaded|received|reviewed|available|verified|approved|complete|included|matched|confirmed|cross-checked|evidenced";
const IDENTITY_TERMS_SOURCE = "identity(?:\\s+verification)?|passport|driving\\s*licen[cs]e|photo\\s*id|id\\s*(?:document|verification|check)|liveness|national\\s*id";
const PROOF_ADDRESS_TERMS_SOURCE = "proof\\s+of\\s+address|address\\s+verification|address\\s+evidence|utility\\s+bill|council\\s+tax|bank\\s+letter";

const IDENTITY_FILE_PATTERNS = [
  /passport/i,
  /driving\s*licen[cs]e/i,
  /photo\s*id/i,
  /proof\s*of\s*id/i,
  /identity/i,
  /id\s*check/i,
  /id\s*verif/i,
  /liveness/i,
  /biometric/i,
  /national\s*id/i,
];

const PROOF_ADDRESS_FILE_PATTERNS = [
  /proof\s*of\s*address/i,
  /utility\s*bill/i,
  /council\s*tax/i,
  /bank\s*letter/i,
  /address\s*verification/i,
  /tenancy/i,
  /statement/i,
];

const OPEN_BANKING_FILE_PATTERNS = [
  /open\s*banking/i,
  /armalytix/i,
  /truelayer/i,
  /plaid/i,
  /thirdfort/i,
  /infotrak/i,
];

function cleanContext(snippet: string, fallback: string): string {
  const cleaned = snippet.replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  return cleaned.length > 170 ? `${cleaned.slice(0, 167)}…` : cleaned;
}

function firstMatchContext(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0];
  }
  return null;
}

function fileNameMatchesAny(fileNames: string[], patterns: RegExp[]): boolean {
  return fileNames.some((name) => patterns.some((pattern) => pattern.test(name)));
}

function hasPositiveEvidenceSignal(text: string, docTermsSource: string): boolean {
  const withPositiveSignal = new RegExp(`\\b(?:${docTermsSource})\\b[^.!?\\n]{0,180}\\b(?:${POSITIVE_SIGNAL_WORDS})\\b`, "i");
  const withPositiveSignalReverse = new RegExp(`\\b(?:${POSITIVE_SIGNAL_WORDS})\\b[^.!?\\n]{0,180}\\b(?:${docTermsSource})\\b`, "i");
  return withPositiveSignal.test(text) || withPositiveSignalReverse.test(text);
}

function hasOpenBankingEvidence(text: string, evidenceFileNames: string[]): boolean {
  const provider = /\b(open\s*banking|armalytix|truelayer|plaid|thirdfort|infotrak)\b/i;
  if (fileNameMatchesAny(evidenceFileNames, OPEN_BANKING_FILE_PATTERNS)) return true;
  if (!provider.test(text)) return false;

  const withPositiveSignal = new RegExp(`\\b(open\\s*banking|armalytix|truelayer|plaid|thirdfort|infotrak)\\b[^.!?\\n]{0,160}\\b(${POSITIVE_SIGNAL_WORDS})\\b`, "i");
  const withPositiveSignalReverse = new RegExp(`\\b(${POSITIVE_SIGNAL_WORDS})\\b[^.!?\\n]{0,160}\\b(open\\s*banking|armalytix|truelayer|plaid|thirdfort|infotrak)\\b`, "i");

  return withPositiveSignal.test(text) || withPositiveSignalReverse.test(text);
}

function requiresStatementsBeyondOpenBanking(text: string, bankContext: string): boolean {
  const patterns = [
    /\b(additional|further|supplementary)\b[^.!?\n]{0,120}\b(bank\s+statement(?:s)?)\b[^.!?\n]{0,160}\b(beyond|in\s+addition\s+to|despite|after|alongside)\b[^.!?\n]{0,90}\b(open\s*banking|armalytix|truelayer|plaid|thirdfort|infotrak)\b/i,
    /\b(open\s*banking|armalytix|truelayer|plaid|thirdfort|infotrak)\b[^.!?\n]{0,160}\b(insufficient|incomplete|does\s+not\s+cover|cannot\s+replace|not\s+sufficient)\b[^.!?\n]{0,140}\b(bank\s+statement(?:s)?)\b/i,
  ];

  return patterns.some((pattern) => pattern.test(text) || pattern.test(bankContext));
}

function requiresSavingsBeyondOpenBanking(text: string, savingsContext: string): boolean {
  const patterns = [
    /\b(savings|accumulation)\b[^.!?\n]{0,160}\b(beyond|in\s+addition\s+to|despite|not\s+explained\s+by|not\s+covered\s+by)\b[^.!?\n]{0,90}\b(open\s*banking|armalytix|truelayer|plaid|thirdfort|infotrak)\b/i,
    /\b(open\s*banking|armalytix|truelayer|plaid|thirdfort|infotrak)\b[^.!?\n]{0,160}\b(does\s+not\s+explain|cannot\s+account\s+for|insufficient\s+to\s+explain|does\s+not\s+show)\b[^.!?\n]{0,140}\b(savings|accumulation|source\s+of\s+wealth)\b/i,
  ];
  return patterns.some((pattern) => pattern.test(text) || pattern.test(savingsContext));
}

function hasIdentityEvidence(text: string, evidenceFileNames: string[]): boolean {
  return hasPositiveEvidenceSignal(text, IDENTITY_TERMS_SOURCE) || fileNameMatchesAny(evidenceFileNames, IDENTITY_FILE_PATTERNS);
}

function requiresAdditionalIdentityDocument(text: string, identityContext: string): boolean {
  const patterns = [
    /\b(expired|out[-\s]?of[-\s]?date|invalid|not\s+acceptable|unacceptable)\b[^.!?\n]{0,160}\b(passport|identity|id\s*document|photo\s*id)\b/i,
    /\b(no\s+other\s+valid|additional|secondary|alternative)\b[^.!?\n]{0,160}\b(passport|identity|id\s*document|photo\s*id)\b/i,
    /\b(unable\s+to\s+verify|cannot\s+verify)\b[^.!?\n]{0,160}\b(identity|passport|id\s*document)\b/i,
  ];

  return patterns.some((pattern) => pattern.test(text) || pattern.test(identityContext));
}

function hasProofOfAddressEvidence(text: string, evidenceFileNames: string[]): boolean {
  if (/\baddress\s+register\b/i.test(text)) return true;
  return hasPositiveEvidenceSignal(text, PROOF_ADDRESS_TERMS_SOURCE) || fileNameMatchesAny(evidenceFileNames, PROOF_ADDRESS_FILE_PATTERNS);
}

function requiresAdditionalProofOfAddress(text: string, proofAddressContext: string): boolean {
  const patterns = [
    /\b(additional|further|updated)\b[^.!?\n]{0,160}\b(proof\s+of\s+address|utility\s+bill|council\s+tax|address\s+evidence)\b/i,
    /\b(proof\s+of\s+address|utility\s+bill|council\s+tax|address\s+evidence)\b[^.!?\n]{0,160}\b(older\s+than\s+3\s+months|out\s*of\s*date|not\s+recent|insufficient|not\s+acceptable)\b/i,
    /\b(address\s+mismatch|does\s+not\s+match|cannot\s+verify\s+current\s+address)\b/i,
  ];

  return patterns.some((pattern) => pattern.test(text) || pattern.test(proofAddressContext));
}

export function parseMissingDocuments(text: string, options: MissingDocParseOptions = {}): MissingDocItem[] {
  if (!text) return [];

  const evidenceFileNames = (options.evidenceFileNames ?? []).map((name) => name.toLowerCase());
  const itemsByCategory = new Map<string, MissingDocItem>();
  const addItem = (item: MissingDocItem) => {
    if (!itemsByCategory.has(item.category)) itemsByCategory.set(item.category, item);
  };

  const identityVerifiedPattern = /\b(identity|passport|driving\s*licen[cs]e|liveness|photo\s*id)\b[^.!?\n]{0,140}\b(verified|approved|confirmed|provided|complete|matched|cross-checked)\b/i;

  const giftContext = firstMatchContext(text, [
    /\b(gift(?:\s+declaration|\s+letter|\s+deed)?)\b[^.!?\n]{0,120}\b(missing|not\s+provided|outstanding|no\s+signed)\b/i,
    /\b(missing|not\s+provided|outstanding|no\s+signed)\b[^.!?\n]{0,120}\b(gift(?:\s+declaration|\s+letter|\s+deed)?)\b/i,
  ]);
  if (giftContext) {
    addItem({
      label: "Gift Declaration",
      category: "gift_declaration",
      context: cleanContext(giftContext, "Gift mentioned but no signed declaration provided."),
    });
  }

  const savingsContext = firstMatchContext(text, [
    /\b(source\s+of\s+savings|savings(?:\s+history|\s+accumulation|\s+explanation)?)\b[^.!?\n]{0,120}\b(missing|not\s+provided|no\s+explanation|outstanding)\b/i,
    /\b(missing|not\s+provided|no\s+explanation|outstanding)\b[^.!?\n]{0,120}\b(source\s+of\s+savings|savings(?:\s+history|\s+accumulation|\s+explanation)?)\b/i,
  ]);
  if (savingsContext) {
    const openBankingEvidencePresent = hasOpenBankingEvidence(text, evidenceFileNames);
    const savingsExplicitlyBeyondOpenBanking = requiresSavingsBeyondOpenBanking(text, savingsContext);

    if (!openBankingEvidencePresent || savingsExplicitlyBeyondOpenBanking) {
      addItem({
        label: "Source of Savings Explanation",
        category: "savings_explanation",
        context: cleanContext(savingsContext, "Savings referenced but no explanation or evidence of accumulation provided."),
      });
    }
  }

  const bankContext = firstMatchContext(text, [
    /\b(bank\s+statement(?:s)?|statement\s+coverage)\b[^.!?\n]{0,120}\b(additional|further|missing|gap|outstanding|incomplete)\b/i,
    /\b(additional|further|missing|gap|outstanding|incomplete)\b[^.!?\n]{0,120}\b(bank\s+statement(?:s)?|statement\s+coverage)\b/i,
  ]);
  if (bankContext) {
    const openBankingEvidencePresent = hasOpenBankingEvidence(text, evidenceFileNames);
    const statementsExplicitlyBeyondOpenBanking = requiresStatementsBeyondOpenBanking(text, bankContext);

    if (!openBankingEvidencePresent || statementsExplicitlyBeyondOpenBanking) {
      addItem({
        label: "Additional Bank Statements",
        category: "bank_statements",
        context: cleanContext(bankContext, "Additional bank statements required to cover gaps in financial trail."),
      });
    }
  }

  const identityContext = firstMatchContext(text, [
    /\b(identity(?:\s+verification)?|passport|driving\s*licen[cs]e|photo\s*id|id\s*(?:document|verification|check)|liveness)\b[^.!?\n]{0,120}\b(missing|not\s+provided|outstanding|unable\s+to\s+verify|not\s+available|not\s+supplied)\b/i,
    /\b(missing|not\s+provided|outstanding|unable\s+to\s+verify|not\s+available|not\s+supplied)\b[^.!?\n]{0,120}\b(identity(?:\s+verification)?|passport|driving\s*licen[cs]e|photo\s*id|id\s*(?:document|verification|check)|liveness)\b/i,
  ]);
  if (identityContext) {
    const identityEvidencePresent = identityVerifiedPattern.test(text) || hasIdentityEvidence(text, evidenceFileNames);
    const identityStillRequired = requiresAdditionalIdentityDocument(text, identityContext);

    if (!identityEvidencePresent || identityStillRequired) {
      addItem({
        label: "Identity Verification Document",
        category: "identity",
        context: cleanContext(identityContext, "Identity document not provided or missing from the evidence bundle."),
      });
    }
  }

  const mortgageContext = firstMatchContext(text, [
    /\b(mortgage\s+offer|mortgage\s+illustration)\b[^.!?\n]{0,120}\b(missing|not\s+provided|outstanding|not\s+available)\b/i,
    /\b(missing|not\s+provided|outstanding|not\s+available)\b[^.!?\n]{0,120}\b(mortgage\s+offer|mortgage\s+illustration)\b/i,
  ]);
  if (mortgageContext) {
    addItem({
      label: "Mortgage Offer / Illustration",
      category: "mortgage",
      severity: "info",
      context: "The mortgage offer is typically not available until later in the transaction — this is not a red flag. A further check may be needed once the offer is received, particularly if the confirmed mortgage amount is less than anticipated in this interim report.",
    });
  }

  const proofAddressContext = firstMatchContext(text, [
    /\b(proof\s+of\s+address|address\s+evidence|address\s+verification|utility\s+bill|council\s+tax)\b[^.!?\n]{0,120}\b(missing|not\s+provided|outstanding|not\s+available)\b/i,
    /\b(missing|not\s+provided|outstanding|not\s+available)\b[^.!?\n]{0,120}\b(proof\s+of\s+address|address\s+evidence|address\s+verification|utility\s+bill|council\s+tax)\b/i,
  ]);
  if (proofAddressContext) {
    const proofAddressEvidencePresent = hasProofOfAddressEvidence(text, evidenceFileNames);
    const proofAddressStillRequired = requiresAdditionalProofOfAddress(text, proofAddressContext);

    if (!proofAddressEvidencePresent || proofAddressStillRequired) {
      addItem({
        label: "Proof of Address",
        category: "proof_of_address",
        context: cleanContext(proofAddressContext, "Proof of current address not provided."),
      });
    }
  }

  const employmentContext = firstMatchContext(text, [
    /\b(payslip(?:s)?|p60|p45|employment\s+letter|sa302)\b[^.!?\n]{0,120}\b(missing|not\s+provided|outstanding|incomplete)\b/i,
    /\b(missing|not\s+provided|outstanding|incomplete)\b[^.!?\n]{0,120}\b(payslip(?:s)?|p60|p45|employment\s+letter|sa302)\b/i,
  ]);
  if (employmentContext) {
    addItem({
      label: "Employment / Income Evidence",
      category: "employment",
      context: cleanContext(employmentContext, "Employment or income evidence referenced but not provided."),
    });
  }

  const openBankingContext = firstMatchContext(text, [
    /\b(open\s+banking)\b[^.!?\n]{0,120}\b(missing|not\s+provided|outstanding|not\s+available)\b/i,
    /\b(missing|not\s+provided|outstanding|not\s+available)\b[^.!?\n]{0,120}\b(open\s+banking)\b/i,
  ]);
  if (openBankingContext && !hasOpenBankingEvidence(text, evidenceFileNames)) {
    addItem({
      label: "Open Banking Data",
      category: "open_banking",
      context: cleanContext(openBankingContext, "Open banking report or verification not provided."),
    });
  }

  const saleProceedsContext = firstMatchContext(text, [
    /\b(sale\s+proceeds|completion\s+statement)\b[^.!?\n]{0,120}\b(missing|not\s+provided|outstanding)\b/i,
    /\b(missing|not\s+provided|outstanding)\b[^.!?\n]{0,120}\b(sale\s+proceeds|completion\s+statement)\b/i,
  ]);
  if (saleProceedsContext) {
    addItem({
      label: "Sale Proceeds / Completion Statement",
      category: "sale_proceeds",
      context: cleanContext(saleProceedsContext, "Evidence of sale proceeds from property disposal not provided."),
    });
  }

  return Array.from(itemsByCategory.values());
}

interface SoWMissingDocumentsProps {
  items: MissingDocItem[];
  onUploadMissing: (file: File, category: string, label: string) => void;
  disabled?: boolean;
  uploadingCategory?: string | null;
  uploadedCategories?: Set<string>;
}

export default function SoWMissingDocuments({
  items,
  onUploadMissing,
  disabled = false,
  uploadingCategory = null,
  uploadedCategories = new Set(),
}: SoWMissingDocumentsProps) {
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  if (items.length === 0) return null;

  const handleFileChange = (category: string, label: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadMissing(file, category, label);
    }
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const isUploading = uploadingCategory === item.category;
        const isUploaded = uploadedCategories.has(item.category);

        return (
          <div
            key={item.category}
            className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
              isUploaded
                ? "border-[hsl(var(--risk-green))]/30 bg-[hsl(var(--risk-green))]/5"
                : item.severity === "info"
                ? "border-accent/20 bg-accent/5"
                : "border-[hsl(var(--risk-red))]/20 bg-[hsl(var(--risk-red-bg))]"
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {isUploaded ? (
                <CheckCircle2 size={12} className="text-[hsl(var(--risk-green))]" />
              ) : item.severity === "info" ? (
                <AlertTriangle size={12} className="text-accent" />
              ) : (
                <AlertTriangle size={12} className="text-[hsl(var(--risk-red))]" />
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="font-medium text-foreground leading-tight">{item.label}</p>
              <p className="text-[10px] text-muted-foreground leading-snug line-clamp-3">{item.context}</p>
            </div>
            <div className="shrink-0">
              <input
                type="file"
                ref={(el) => { fileInputRefs.current[item.category] = el; }}
                className="hidden"
                onChange={(e) => handleFileChange(item.category, item.label, e)}
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.tif,.tiff,.xlsx,.xls,.csv,.txt,.eml"
                disabled={disabled || isUploading}
              />
              {isUploaded ? (
                <span className="text-[10px] text-[hsl(var(--risk-green))] font-medium">Updated</span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px] gap-1 text-accent hover:text-accent/80"
                  disabled={disabled || isUploading}
                  onClick={() => fileInputRefs.current[item.category]?.click()}
                >
                  {isUploading ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <Upload size={10} />
                  )}
                  {isUploading ? "Uploading…" : "Upload"}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
