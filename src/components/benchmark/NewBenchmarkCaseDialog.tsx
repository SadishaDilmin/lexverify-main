import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const CASE_TYPES = [
  { value: "freehold_purchase", label: "Freehold Purchase" },
  { value: "leasehold_purchase", label: "Leasehold Purchase" },
  { value: "seller_identity_risk", label: "Seller Identity Risk" },
  { value: "source_of_wealth", label: "Source of Wealth" },
  { value: "title_review", label: "Title Review" },
  { value: "pre_exchange_review", label: "Pre-Exchange Review" },
];

const AGENT_TYPES = [
  { value: "source-of-wealth", label: "Olimey AI (SoW)" },
];

export interface NewCaseForm {
  title: string;
  property_address: string;
  transaction_type: string;
  case_type: string;
  agent_type: string;
  notes: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (f: NewCaseForm) => void;
  isPending: boolean;
}

export default function NewBenchmarkCaseDialog({ open, onOpenChange, onSubmit, isPending }: Props) {
  const [form, setForm] = useState<NewCaseForm>({ title: "", property_address: "", transaction_type: "Purchase", case_type: "freehold_purchase", agent_type: "source-of-wealth", notes: "" });
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Benchmark Case</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label className="text-xs">Title *</Label><Input className="mt-1" value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Leasehold Purchase — Missed Lease Risk" /></div>
          <div><Label className="text-xs">Description</Label><Input className="mt-1" value={form.property_address} onChange={e => set("property_address", e.target.value)} placeholder="Short case description shown in AI Learning Engine" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Transaction Type</Label>
              <Select value={form.transaction_type} onValueChange={v => set("transaction_type", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Purchase">Purchase</SelectItem>
                  <SelectItem value="Sale">Sale</SelectItem>
                  <SelectItem value="Remortgage">Remortgage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Case Type</Label>
              <Select value={form.case_type} onValueChange={v => set("case_type", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{CASE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">AI Agent Being Benchmarked</Label>
            <Select value={form.agent_type} onValueChange={v => set("agent_type", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{AGENT_TYPES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Notes</Label><Textarea className="mt-1" value={form.notes} onChange={e => set("notes", e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSubmit(form)} disabled={!form.title || isPending}>{isPending ? "Creating…" : "Create Case"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
