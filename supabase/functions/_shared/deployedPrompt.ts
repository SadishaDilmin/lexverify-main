import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Fetches the active prompt for a given agent.
 * Priority: 1) deployed version from prompt_versions  2) base prompt from prompt_defaults
 * If neither exists, throws PROMPT_NOT_FOUND to ensure 100% DB-auditable AI behaviour.
 */
export async function getDeployedPrompt(agentId: string): Promise<string> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. Check for a deployed version
  const { data: deployed, error: deployedErr } = await supabase
    .from("prompt_versions")
    .select("prompt_text")
    .eq("agent_id", agentId)
    .eq("status", "deployed")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!deployedErr && deployed?.prompt_text && deployed.prompt_text.trim().length > 50) {
    console.log(`[deployedPrompt] Using deployed prompt for "${agentId}" (${deployed.prompt_text.length} chars)`);
    return appendIngestionDirective(deployed.prompt_text);
  }

  // 2. Fallback to prompt_defaults
  const { data: defaults, error: defaultsErr } = await supabase
    .from("prompt_defaults")
    .select("base_prompt_text")
    .eq("agent_id", agentId)
    .maybeSingle();

  if (!defaultsErr && defaults?.base_prompt_text && defaults.base_prompt_text.trim().length > 50) {
    console.log(`[deployedPrompt] Using base default prompt for "${agentId}" (${defaults.base_prompt_text.length} chars)`);
    return appendIngestionDirective(defaults.base_prompt_text);
  }

  // 3. No prompt found — fail loudly
  const errorMsg = `PROMPT_NOT_FOUND: No deployed version or default prompt exists for agent "${agentId}". All AI behaviour must be DB-auditable.`;
  console.error(`[deployedPrompt] ${errorMsg}`);
  throw new Error(errorMsg);
}

const INGESTION_DIRECTIVE = `

## Document Analysis Priority
When performing any analysis, ALWAYS process the case file records first. Read, extract, and assess the actual uploaded documents (PDFs, Word files, audio transcriptions, images via OCR) associated with the case before consulting any other source. Once the case file evidence has been fully reviewed, compare findings against the knowledge_base_content table — which contains pre-extracted, searchable text from firm-wide reference materials, regulatory guidance, and precedent documents — to determine whether enquiries need to be raised, assess risk levels, and identify any additional considerations. The knowledge base informs and benchmarks your analysis; the case files are the primary evidence.
`;

function appendIngestionDirective(prompt: string): string {
  // Avoid duplicating the directive if it's already present
  if (prompt.includes("knowledge_base_content")) return prompt;
  return prompt + INGESTION_DIRECTIVE;
}
