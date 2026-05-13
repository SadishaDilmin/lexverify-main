import {
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type AgentCategory =
  | "Compliance";

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  category: AgentCategory;
  interactionType: "chat" | "form" | "case-review";
  icon: LucideIcon;
  available: boolean;
  /** Whether the agent is visible to regular users. Admin always sees all agents. */
  published?: boolean;
  /** Whether the agent is in beta test mode */
  betaTest?: boolean;
  details: string[];
  creditCost?: number;
  /** For case-review agents, link to existing flow instead of generic chat */
  linkTo?: string;
  /** Form fields for form-based agents */
  formFields?: FormFieldConfig[];
}

export interface FormFieldConfig {
  name: string;
  label: string;
  type: "text" | "textarea" | "select";
  placeholder?: string;
  required?: boolean;
  options?: string[];
}

export const agents: AgentConfig[] = [
  {
    id: "source-of-wealth",
    name: "Olimey AI",
    description:
      "Structured Source of Wealth assessment for residential property transactions in England and Wales, aligned with the Money Laundering Regulations 2017 and Proceeds of Crime Act 2002.",
    category: "Compliance",
    interactionType: "form",
    icon: Wallet,
    available: true,
    published: true,
    creditCost: 20,
    details: [
      "Full AML-compliant Source of Wealth analysis with risk rating",
      "Cross-references bank statements, payslips, investments, and consolidated reports",
      "Structured enquiries with transaction-level referencing",
      "Pre-analysis funding sufficiency gate with Compliance Officer confirmation",
      "Audit-defensible output with hallucination controls and evidence citations",
      "Each follow-up reply ingestion costs 1 additional credit",
    ],
    formFields: [
      { name: "clientName", label: "Client Name", type: "text", placeholder: "Full name of the client…", required: true },
      { name: "purchasePrice", label: "Purchase Price (£)", type: "text", placeholder: "e.g. 450,000", required: true },
      { name: "fundingSource", label: "Primary Funding Source", type: "select", options: ["Mortgage & Savings", "Cash Purchase", "Gift & Savings", "Sale of Existing Property", "Inheritance", "Investment Proceeds", "Other"], required: true },
      { name: "additionalContext", label: "Additional Context", type: "textarea", placeholder: "Any relevant details — e.g. gifted deposit, overseas funds, multiple sources…" },
    ],
  },
];

export const ALL_CATEGORIES: AgentCategory[] = [
  "Compliance",
];

export function getAgentById(id: string): AgentConfig | undefined {
  return agents.find((a) => a.id === id);
}

export function getAvailableAgents(): AgentConfig[] {
  return agents.filter((a) => a.available);
}

/** Returns agents visible to the given role. Admins see everything; regular users only see published agents. */
export function getVisibleAgents(role: string | null): AgentConfig[] {
  if (role === "admin") return agents;
  return agents.filter((a) => a.published !== false);
}

export function getAgentsByCategory(
  filter?: { search?: string; category?: AgentCategory | "all" }
): Record<string, AgentConfig[]> {
  let filtered = agents;

  if (filter?.search) {
    const q = filter.search.toLowerCase();
    filtered = filtered.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
    );
  }

  if (filter?.category && filter.category !== "all") {
    filtered = filtered.filter((a) => a.category === filter.category);
  }

  return filtered.reduce(
    (acc, agent) => {
      const cat = agent.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(agent);
      return acc;
    },
    {} as Record<string, AgentConfig[]>
  );
}
