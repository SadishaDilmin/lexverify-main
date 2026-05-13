import { useState, useEffect, useRef } from "react";
import {
  FileText, Users, Gift, Plus, Trash2, Paperclip, AlertTriangle,
  ChevronDown, ChevronRight, Upload, Maximize2, Minimize2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileChip, type AttachedFile } from "@/components/AgentChatFileAttachment";

import SoWFundingGapCalculator from "./SoWFundingGapCalculator";
import SoWRiskGuidance from "./SoWRiskGuidance";
import SoWIntakeWizard from "./SoWIntakeWizard";

// Re-export needed types
export interface PersonDetail {
  id: string;
  fullName: string;
  role: "Purchaser" | "Giftor";
  fundingSource: string;
  fundingSourceOther: string;
  contributionAmount: string;
  employmentStatus: string;
  employmentStatusOther: string;
  additionalNotes: string;
  relationshipToPurchaser: string;
  relationshipOther: string;
  files: AttachedFile[];
  raiseEnquiryFunding: boolean;
  raiseEnquiryEmployment: boolean;
  pepStatus: string;
  buyerType: string;
}

const FUNDING_OPTIONS = [
  "Salary / Employment Income", "Savings", "Sale of Existing Property", "Gift",
  "Inheritance", "Investment Proceeds", "Pension Lump Sum",
  "Compensation / Settlement", "Business Profits", "Mortgage", "Other",
];
const EMPLOYMENT_OPTIONS = [
  "Employed", "Self-Employed", "Director / Business Owner", "Retired",
  "Not Currently Employed", "Student", "Other",
];
const RELATIONSHIP_OPTIONS = [
  "Parent", "Grandparent", "Spouse / Partner", "Sibling",
  "Other Family Member", "Friend", "Employer", "Other",
];
const PEP_STATUS_OPTIONS = [
  "Unknown", "Not a PEP", "PEP", "PEP Family Member", "PEP Close Associate",
];
const BUYER_TYPE_OPTIONS = [
  "Standard", "First-Time Buyer", "Additional Dwelling", "Non-UK Resident", "Company",
];
const RISK_CLASSIFICATION_OPTIONS = [
  { value: "", label: "Not assessed" },
  { value: "low", label: "Low Risk" },
  { value: "medium", label: "Medium Risk" },
  { value: "high", label: "High Risk" },
  { value: "very_high", label: "Very High Risk" },
];
const DOC_CATEGORY_SLOTS = [
  { id: "identity", label: "Identity Documents", hint: "Passport, driving licence, national ID" },
  { id: "proof_of_address", label: "Proof of Address", hint: "Utility bill, council tax, bank letter" },
  { id: "bank_statements", label: "Bank Statements", hint: "3+ months of current account statements" },
  { id: "open_banking", label: "Open Banking Reports", hint: "Armalytix, Thirdfort, Infotrak reports" },
  { id: "client_questionnaire", label: "Client Questionnaire", hint: "SoW/SoF questionnaire responses" },
] as const;

interface TransactionFields {
  propertyAddress: string;
  purchasePrice: string;
  caseReference: string;
  tenure: string;
  stampDuty: string;
  legalFees: string;
  mortgageAmount: string;
  clientFundsToVerify: string;
  additionalContext: string;
  transactionType: string;
  propertyType: string;
  lender: string;
  riskClassification: string;
}

interface SoWTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** @deprecated mode is ignored — both sections are always shown as tabs */
  mode?: "transaction" | "parties";
  initialTab?: "transaction" | "parties";
  fields: TransactionFields;
  onFieldChange: (field: keyof TransactionFields, value: string) => void;
  /** Optional commit-time hook (fires on blur). Used for fields that need
   * to persist to the database immediately rather than only at dispatch. */
  onFieldBlur?: (field: keyof TransactionFields, value: string) => void;
  purchasers: PersonDetail[];
  giftors: PersonDetail[];
  hasGiftors: boolean;
  onAddPurchaser: () => void;
  onRemovePurchaser: (id: string) => void;
  onUpdatePurchaser: (id: string, field: keyof PersonDetail, value: any) => void;
  onAddGiftor: () => void;
  onRemoveGiftor: (id: string) => void;
  onUpdateGiftor: (id: string, field: keyof PersonDetail, value: any) => void;
  onGiftorToggle: (checked: boolean) => void;
  onPersonFileUpload: (personId: string, role: "Purchaser" | "Giftor", files: FileList, docCategory?: string) => void;
  onRemovePersonFile: (personId: string, fileId: string, role: "Purchaser" | "Giftor") => void;
  isLoading: boolean;
  attachedFiles: AttachedFile[];
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (id: string) => void;
  pendingArmalytixUpdate?: any;
  onApplyArmalytixUpdate?: () => void;
  armalytixFilledFields?: Set<string>;
}

function PersonCard({
  person,
  index,
  onUpdate,
  onRemove,
  canRemove,
  onFileUpload,
  onRemoveFile,
  isLoading,
}: {
  person: PersonDetail;
  index: number;
  onUpdate: (id: string, field: keyof PersonDetail, value: any) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
  onFileUpload: (personId: string, role: "Purchaser" | "Giftor", files: FileList, docCategory?: string) => void;
  onRemoveFile: (personId: string, fileId: string, role: "Purchaser" | "Giftor") => void;
  isLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const personFileInputId = `dialog-person-file-${person.id}`;

  return (
    <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
        <span className="text-sm font-medium text-foreground flex-1">{person.fullName || `${person.role} ${index + 1}`}</span>
        {person.files.length > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-medium">
            <Paperclip size={10} /> {person.files.length}
          </span>
        )}
        {canRemove && (
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onRemove(person.id); }}>
            <Trash2 size={12} />
          </Button>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Full Name <span className="text-destructive">*</span></Label>
              <Input placeholder="Full legal name…" value={person.fullName} onChange={(e) => onUpdate(person.id, "fullName", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Contribution (£)</Label>
              <Input placeholder="e.g. 150,000" value={person.contributionAmount} onChange={(e) => onUpdate(person.id, "contributionAmount", e.target.value)} />
            </div>
          </div>

          {person.role === "Giftor" && (
            <div className="space-y-1">
              <Label className="text-xs">Relationship <span className="text-destructive">*</span></Label>
              <Select value={person.relationshipToPurchaser} onValueChange={(v) => { onUpdate(person.id, "relationshipToPurchaser", v); if (v !== "Other") onUpdate(person.id, "relationshipOther", ""); }}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{RELATIONSHIP_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
              {person.relationshipToPurchaser === "Other" && (
                <Input placeholder="Specify…" value={person.relationshipOther} onChange={(e) => onUpdate(person.id, "relationshipOther", e.target.value)} className="mt-1" />
              )}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Funding Source {!person.raiseEnquiryFunding && <span className="text-destructive">*</span>}</Label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <Checkbox checked={person.raiseEnquiryFunding} onCheckedChange={(c) => { onUpdate(person.id, "raiseEnquiryFunding", !!c); if (c) { onUpdate(person.id, "fundingSource", ""); onUpdate(person.id, "fundingSourceOther", ""); } }} className="h-3 w-3" />
                  <span className="text-[10px] text-[hsl(var(--risk-amber))] font-medium">Enquiry</span>
                </label>
              </div>
              {person.raiseEnquiryFunding ? (
                <div className="flex items-center gap-1 px-2 py-1.5 rounded bg-[hsl(var(--risk-amber-bg))] text-[10px] text-[hsl(var(--risk-amber))]">
                  <AlertTriangle size={10} /> Enquiry will be raised
                </div>
              ) : (
                <>
                  <Select value={person.fundingSource} onValueChange={(v) => { onUpdate(person.id, "fundingSource", v); if (v !== "Other") onUpdate(person.id, "fundingSourceOther", ""); }}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>{FUNDING_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                  {person.fundingSource === "Other" && <Input placeholder="Specify…" value={person.fundingSourceOther} onChange={(e) => onUpdate(person.id, "fundingSourceOther", e.target.value)} className="mt-1" />}
                </>
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Employment</Label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <Checkbox checked={person.raiseEnquiryEmployment} onCheckedChange={(c) => { onUpdate(person.id, "raiseEnquiryEmployment", !!c); if (c) { onUpdate(person.id, "employmentStatus", ""); onUpdate(person.id, "employmentStatusOther", ""); } }} className="h-3 w-3" />
                  <span className="text-[10px] text-[hsl(var(--risk-amber))] font-medium">Enquiry</span>
                </label>
              </div>
              {person.raiseEnquiryEmployment ? (
                <div className="flex items-center gap-1 px-2 py-1.5 rounded bg-[hsl(var(--risk-amber-bg))] text-[10px] text-[hsl(var(--risk-amber))]">
                  <AlertTriangle size={10} /> Enquiry will be raised
                </div>
              ) : (
                <>
                  <Select value={person.employmentStatus} onValueChange={(v) => { onUpdate(person.id, "employmentStatus", v); if (v !== "Other") onUpdate(person.id, "employmentStatusOther", ""); }}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>{EMPLOYMENT_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                  {person.employmentStatus === "Other" && <Input placeholder="Specify…" value={person.employmentStatusOther} onChange={(e) => onUpdate(person.id, "employmentStatusOther", e.target.value)} className="mt-1" />}
                </>
              )}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">PEP Status</Label>
              <Select value={person.pepStatus} onValueChange={(v) => onUpdate(person.id, "pepStatus", v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{PEP_STATUS_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {person.role === "Purchaser" && (
              <div className="space-y-1">
                <Label className="text-xs">Buyer Type</Label>
                <Select value={person.buyerType} onValueChange={(v) => onUpdate(person.id, "buyerType", v)}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{BUYER_TYPE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea placeholder="Additional notes…" value={person.additionalNotes} onChange={(e) => onUpdate(person.id, "additionalNotes", e.target.value)} className="min-h-[50px] resize-none" />
          </div>

          {/* Categorised document upload slots */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold flex items-center gap-1"><Upload size={10} /> Document Checklist</Label>
            <div className="grid gap-2">
              {DOC_CATEGORY_SLOTS.map((slot) => {
                const slotFiles = person.files.filter(f => (f as any).docCategory === slot.id);
                const personSlotInputId = `slot-${person.id}-${slot.id}`;
                return (
                  <div key={slot.id} className="rounded-md border border-border bg-muted/20 p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-medium text-foreground">{slot.label}</span>
                        <p className="text-[10px] text-muted-foreground">{slot.hint}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {slotFiles.length > 0 && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-risk-green-bg text-risk-green px-1.5 py-0.5 text-[10px] font-medium border border-risk-green/20">
                            ✓ {slotFiles.length}
                          </span>
                        )}
                        <input id={personSlotInputId} type="file" multiple className="hidden" onChange={(e) => {
                          if (e.target.files?.length) {
                            // Tag files with docCategory before uploading
                            const fileList = e.target.files;
                            onFileUpload(person.id, person.role, fileList, slot.id);
                          }
                          e.target.value = "";
                        }} />
                        <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] gap-0.5 px-2" onClick={() => document.getElementById(personSlotInputId)?.click()} disabled={isLoading}>
                          <Paperclip size={9} /> Add
                        </Button>
                      </div>
                    </div>
                    {slotFiles.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {slotFiles.map((f) => (
                          <FileChip key={f.id} file={f} onRemove={() => onRemoveFile(person.id, f.id, person.role)} disabled={isLoading} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* General / uncategorised docs */}
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><Paperclip size={10} /> Other Documents</Label>
            {person.files.filter(f => !(f as any).docCategory).length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1">
                {person.files.filter(f => !(f as any).docCategory).map((f) => (
                  <FileChip key={f.id} file={f} onRemove={() => onRemoveFile(person.id, f.id, person.role)} disabled={isLoading} />
                ))}
              </div>
            )}
            <input id={personFileInputId} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) onFileUpload(person.id, person.role, e.target.files); e.target.value = ""; }} />
            <Button type="button" variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={() => document.getElementById(personFileInputId)?.click()} disabled={isLoading}>
              <Paperclip size={10} /> Attach Other
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SoWTransactionDialog({
  open,
  onOpenChange,
  mode: _mode,
  initialTab,
  fields,
  onFieldChange,
  onFieldBlur,
  purchasers,
  giftors,
  hasGiftors,
  onAddPurchaser,
  onRemovePurchaser,
  onUpdatePurchaser,
  onAddGiftor,
  onRemoveGiftor,
  onUpdateGiftor,
  onGiftorToggle,
  onPersonFileUpload,
  onRemovePersonFile,
  isLoading,
  attachedFiles,
  fileInputRef,
  onFileSelect,
  onRemoveFile,
  pendingArmalytixUpdate,
  onApplyArmalytixUpdate,
  armalytixFilledFields,
}: SoWTransactionDialogProps) {
  const [activeDialogTab, setActiveDialogTab] = useState<"transaction" | "parties">(initialTab ?? _mode ?? "transaction");
  const [wizardStep, setWizardStep] = useState("property");

  // Reset to initial tab when dialog opens
  const prevOpen = useState(open)[0];
  if (open && !prevOpen) {
    // handled via useEffect below
  }

  const allPersons = [...purchasers, ...(hasGiftors ? giftors : [])];
  const contributions = allPersons.map(p => ({
    name: p.fullName,
    amount: p.contributionAmount,
    role: p.role,
  }));

  // Wizard steps for transaction tab
  const transactionWizardSteps = [
    { id: "property", label: "Property", complete: !!fields.propertyAddress && !!fields.purchasePrice },
    { id: "funding", label: "Funding", complete: !!fields.mortgageAmount || !!fields.clientFundsToVerify || allPersons.some(p => !!p.contributionAmount) },
    { id: "risk", label: "Risk", complete: !!fields.riskClassification && fields.riskClassification !== "not_assessed" },
    { id: "context", label: "Context", complete: !!fields.additionalContext || attachedFiles.length > 0 },
  ];

  const partiesWizardSteps = [
    { id: "parties", label: "Parties", complete: purchasers.some(p => !!p.fullName) },
    { id: "giftors_step", label: "Giftors", complete: !hasGiftors || giftors.some(g => !!g.fullName) },
  ];

  const activeWizardSteps = activeDialogTab === "transaction" ? transactionWizardSteps : partiesWizardSteps;

  // Reset wizard step when switching tabs
  const handleTabChange = (tab: string) => {
    setActiveDialogTab(tab as "transaction" | "parties");
    setWizardStep(tab === "transaction" ? "property" : "parties");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText size={18} className="text-accent" /> Case Details & Parties
          </DialogTitle>
          <DialogDescription>
            Edit transaction details, property info, and manage purchasers & giftors.
          </DialogDescription>
          {pendingArmalytixUpdate && onApplyArmalytixUpdate && (
            <Button
              type="button"
              size="sm"
              className="mt-2 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={onApplyArmalytixUpdate}
            >
              ✨ Apply Armalytix Data to Form
            </Button>
          )}
        </DialogHeader>

        {/* Top-level tabs: Transaction / Parties */}
        <Tabs value={activeDialogTab} onValueChange={handleTabChange} className="px-6 pt-2">
          <TabsList className="w-full">
            <TabsTrigger value="transaction" className="flex-1 gap-1.5 text-xs">
              <FileText size={13} /> Transaction Details
            </TabsTrigger>
            <TabsTrigger value="parties" className="flex-1 gap-1.5 text-xs">
              <Users size={13} /> Parties & Documents
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Wizard Step Navigation */}
        <SoWIntakeWizard
          currentStep={wizardStep}
          onStepChange={setWizardStep}
          steps={activeWizardSteps}
        />

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
          {activeDialogTab === "transaction" ? (
            <div className="space-y-4 pt-4">
              {/* Step: Property */}
              {wizardStep === "property" && (
                <>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Property Address <span className="text-destructive">*</span></Label>
                      <Input value={fields.propertyAddress} onChange={(e) => onFieldChange("propertyAddress", e.target.value)} placeholder="Full address…" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Purchase Price (£) <span className="text-destructive">*</span></Label>
                      <Input value={fields.purchasePrice} onChange={(e) => onFieldChange("purchasePrice", e.target.value)} placeholder="e.g. 450,000" />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Case Reference</Label>
                      <Input value={fields.caseReference} onChange={(e) => onFieldChange("caseReference", e.target.value)} placeholder="e.g. ABC/12345" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Tenure</Label>
                      <Select value={fields.tenure} onValueChange={(v) => onFieldChange("tenure", v)}>
                        <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>{["Freehold", "Leasehold", "Share of Freehold", "Commonhold", "Unknown"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Transaction Type</Label>
                      <Select value={fields.transactionType} onValueChange={(v) => onFieldChange("transactionType", v)}>
                        <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>{["Purchase", "Sale"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Property Type</Label>
                      <Select value={fields.propertyType} onValueChange={(v) => onFieldChange("propertyType", v)}>
                        <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>{["House", "Flat", "Maisonette", "Other", "Unknown"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {/* Step: Funding */}
              {wizardStep === "funding" && (
                <>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Lender</Label>
                      <Input value={fields.lender} onChange={(e) => onFieldChange("lender", e.target.value)} placeholder="e.g. Nationwide" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm flex items-center gap-1.5">
                        Mortgage Amount (£)
                        {armalytixFilledFields?.has("mortgageAmount") && (
                          <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded">✓ Armalytix</span>
                        )}
                      </Label>
                      <Input
                        value={fields.mortgageAmount}
                        onChange={(e) => onFieldChange("mortgageAmount", e.target.value)}
                        placeholder="e.g. 350,000"
                        className={armalytixFilledFields?.has("mortgageAmount") ? "border-emerald-300 dark:border-emerald-700" : ""}
                      />
                    </div>
                  </div>
                  {!fields.mortgageAmount.trim() && (
                    <div className="space-y-1.5 rounded-lg border border-accent/20 bg-accent/5 p-3">
                      <Label className="text-sm flex items-center gap-1.5">
                        Client Funds to Verify (£)
                      </Label>
                      <p className="text-[10px] text-muted-foreground -mt-0.5">
                        If the mortgage amount is not yet known, enter the total client funds you need to verify for this transaction.
                      </p>
                      <Input
                        value={fields.clientFundsToVerify}
                        onChange={(e) => onFieldChange("clientFundsToVerify", e.target.value)}
                        placeholder="e.g. 150,000"
                      />
                    </div>
                  )}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm flex items-center gap-1.5">
                          Stamp Duty (£)
                          {armalytixFilledFields?.has("stampDuty") && (
                            <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded">✓ Armalytix</span>
                          )}
                        </Label>
                      </div>
                      <Input
                        value={fields.stampDuty}
                        onChange={(e) => onFieldChange("stampDuty", e.target.value)}
                        onBlur={(e) => onFieldBlur?.("stampDuty", e.target.value)}
                        placeholder="e.g. 12,500"
                        className={armalytixFilledFields?.has("stampDuty") ? "border-emerald-300 dark:border-emerald-700" : ""}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Legal Fees (£)</Label>
                      <Input value={fields.legalFees} onChange={(e) => onFieldChange("legalFees", e.target.value)} placeholder="e.g. 1,500" />
                    </div>
                  </div>

                  {/* Live Funding Gap Calculator */}
                  <SoWFundingGapCalculator
                    purchasePrice={fields.purchasePrice}
                    mortgageAmount={fields.mortgageAmount}
                    stampDuty={fields.stampDuty}
                    legalFees={fields.legalFees}
                    contributions={contributions}
                  />
                </>
              )}

              {/* Step: Risk */}
              {wizardStep === "risk" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Conveyancer Risk Classification</Label>
                    <p className="text-[11px] text-muted-foreground -mt-1">Your preliminary risk assessment of this client/transaction based on the information available to you.</p>
                    <Select value={fields.riskClassification} onValueChange={(v) => onFieldChange("riskClassification", v)}>
                      <SelectTrigger><SelectValue placeholder="Select risk level…" /></SelectTrigger>
                      <SelectContent>
                        {RISK_CLASSIFICATION_OPTIONS.map((o) => (
                          <SelectItem key={o.value || "none"} value={o.value || "not_assessed"}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Inline Risk Guidance */}
                  {(fields.riskClassification === "high" || fields.riskClassification === "very_high") && (
                    <SoWRiskGuidance riskLevel={fields.riskClassification} />
                  )}
                </>
              )}

              {/* Step: Context & Documents */}
              {wizardStep === "context" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Additional Context</Label>
                    <PersistentHeightTextarea
                      storageKey="sow.additionalContext.height"
                      autosaveKey="sow.additionalContext.draft"
                      value={fields.additionalContext}
                      onChange={(e) => onFieldChange("additionalContext", e.target.value)}
                      onAutoRestore={(text) => onFieldChange("additionalContext", text)}
                      placeholder="Any relevant details…"
                      defaultMinHeight={200}
                      expandedHeight="70vh"
                    />
                  </div>

                  {/* Shared docs */}
                  <div className="space-y-1.5">
                    <Label className="text-sm">Shared Documents</Label>
                    {attachedFiles.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {attachedFiles.map((f) => (
                          <FileChip key={f.id} file={f} onRemove={() => onRemoveFile(f.id)} disabled={isLoading} />
                        ))}
                      </div>
                    )}
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFileSelect} />
                    <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={() => fileInputRef.current?.click()}>
                      <Upload size={12} /> Browse Files
                    </Button>
                  </div>
                </>
              )}

            </div>
          ) : (
            <div className="space-y-4 pt-4">
              {/* Purchasers */}
              {(wizardStep === "parties" || !partiesWizardSteps.some(s => s.id === wizardStep)) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold flex items-center gap-2"><Users size={14} className="text-accent" /> Purchasers</h4>
                    <Button type="button" variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={onAddPurchaser}>
                      <Plus size={12} /> Add
                    </Button>
                  </div>
                  {purchasers.map((p, i) => (
                    <PersonCard
                      key={p.id}
                      person={p}
                      index={i}
                      onUpdate={onUpdatePurchaser}
                      onRemove={onRemovePurchaser}
                      canRemove={purchasers.length > 1}
                      onFileUpload={onPersonFileUpload}
                      onRemoveFile={onRemovePersonFile}
                      isLoading={isLoading}
                    />
                  ))}
                </div>
              )}

              {/* Giftors */}
              {(wizardStep === "giftors_step" || wizardStep === "parties") && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold flex items-center gap-2"><Gift size={14} className="text-accent" /> Giftors</h4>
                    <div className="flex items-center gap-2">
                      <Label className="text-[11px] text-muted-foreground">Gifted deposit?</Label>
                      <Switch checked={hasGiftors} onCheckedChange={onGiftorToggle} />
                    </div>
                  </div>
                  {hasGiftors && (
                    <>
                      {giftors.map((g, i) => (
                        <PersonCard
                          key={g.id}
                          person={g}
                          index={i}
                          onUpdate={onUpdateGiftor}
                          onRemove={onRemoveGiftor}
                          canRemove={giftors.length > 1}
                          onFileUpload={onPersonFileUpload}
                          onRemoveFile={onRemovePersonFile}
                          isLoading={isLoading}
                        />
                      ))}
                      <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={onAddGiftor}>
                        <Plus size={12} /> Add Giftor
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* Funding Gap Preview (if enough data) */}
              {purchasers.some(p => !!p.contributionAmount) && fields.purchasePrice && (
                <SoWFundingGapCalculator
                  purchasePrice={fields.purchasePrice}
                  mortgageAmount={fields.mortgageAmount}
                  stampDuty={fields.stampDuty}
                  legalFees={fields.legalFees}
                  contributions={contributions}
                />
              )}
            </div>
          )}
        </div>

        {/* Step navigation buttons — always visible outside ScrollArea */}
        {activeDialogTab === "transaction" && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-border/40">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              disabled={wizardStep === transactionWizardSteps[0].id}
              onClick={() => {
                const idx = transactionWizardSteps.findIndex(s => s.id === wizardStep);
                if (idx > 0) setWizardStep(transactionWizardSteps[idx - 1].id);
              }}
            >
              ← Previous
            </Button>
            {wizardStep !== transactionWizardSteps[transactionWizardSteps.length - 1].id ? (
              <Button
                size="sm"
                className="text-xs bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={() => {
                  const idx = transactionWizardSteps.findIndex(s => s.id === wizardStep);
                  if (idx < transactionWizardSteps.length - 1) setWizardStep(transactionWizardSteps[idx + 1].id);
                }}
              >
                Next →
              </Button>
            ) : (
              <Button
                size="sm"
                className="text-xs bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={() => onOpenChange(false)}
              >
                Done ✓
              </Button>
            )}
          </div>
        )}
        {activeDialogTab === "parties" && (
          <div className="flex items-center justify-end px-6 py-3 border-t border-border/40">
            <Button
              size="sm"
              className="text-xs bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={() => onOpenChange(false)}
            >
              Done ✓
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Textarea that persists its user-resized height + autosaves text ──
interface PersistentHeightTextareaProps {
  /** localStorage key for persisted resize height. */
  storageKey: string;
  /** Optional localStorage key for autosaving text content (debounced). */
  autosaveKey?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  /** Called once on mount if `value` is empty and a draft was found in storage. */
  onAutoRestore?: (text: string) => void;
  placeholder?: string;
  defaultMinHeight: number;
  /** CSS height applied when the user clicks Expand. Defaults to 70vh. */
  expandedHeight?: string;
}

function PersistentHeightTextarea({
  storageKey,
  autosaveKey,
  value,
  onChange,
  onAutoRestore,
  placeholder,
  defaultMinHeight,
  expandedHeight = "70vh",
}: PersistentHeightTextareaProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [collapsedHeight, setCollapsedHeight] = useState<number>(() => {
    if (typeof window === "undefined") return defaultMinHeight;
    const stored = window.localStorage.getItem(storageKey);
    const parsed = stored ? parseInt(stored, 10) : NaN;
    return Number.isFinite(parsed) && parsed >= defaultMinHeight ? parsed : defaultMinHeight;
  });

  // ── Restore autosaved draft on mount (only if the parent value is empty) ──
  // Runs once. We deliberately do not depend on `value` so a user's later
  // deletion is not reverted by this hook.
  const restoreAttemptedRef = useRef(false);
  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;
    if (!autosaveKey || !onAutoRestore) return;
    if (value && value.length > 0) return;
    try {
      const saved = window.localStorage.getItem(autosaveKey);
      if (saved && saved.length > 0) {
        onAutoRestore(saved);
      }
    } catch {
      /* storage unavailable — ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Autosave text on change (debounced 400ms) ──
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!autosaveKey) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      try {
        if (value && value.length > 0) {
          window.localStorage.setItem(autosaveKey, value);
        } else {
          window.localStorage.removeItem(autosaveKey);
        }
        setSavedAt(Date.now());
      } catch {
        /* storage unavailable — ignore */
      }
    }, 400);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [value, autosaveKey]);

  // Persist height when the user resizes the textarea via the resize handle.
  // Paused while expanded so the toggle does not overwrite the saved size.
  useEffect(() => {
    if (expanded) return;
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const h = Math.round(entry.contentRect.height);
      if (h < defaultMinHeight) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setCollapsedHeight(h);
        try {
          window.localStorage.setItem(storageKey, String(h));
        } catch {
          /* storage unavailable — ignore */
        }
      });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [storageKey, expanded, defaultMinHeight]);

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={expanded ? "resize-none pr-10" : "resize-y pr-10"}
        style={
          expanded
            ? { height: expandedHeight, minHeight: expandedHeight }
            : { height: collapsedHeight, minHeight: defaultMinHeight }
        }
      />
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? "Collapse editor" : "Expand editor"}
        title={expanded ? "Collapse" : "Expand"}
        className="absolute top-1.5 right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/90 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </button>
      {autosaveKey && savedAt && (
        <p className="mt-1 text-[11px] text-muted-foreground" aria-live="polite">
          Draft autosaved
        </p>
      )}
    </div>
  );
}
