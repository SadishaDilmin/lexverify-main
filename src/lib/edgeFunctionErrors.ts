/**
 * Extract a human-readable error message from a Supabase edge function response.
 *
 * `supabase.functions.invoke()` returns `{ data, error }` but the `error`
 * object is a generic `FunctionsHttpError` whose `.message` is often just
 * "Edge Function returned a non-2xx status code".  The *actual* error detail
 * lives inside `error.context` (the raw Response), which must be read as JSON.
 *
 * This helper normalises all of that into a single descriptive string.
 */
export async function extractEdgeFunctionError(
  resp: { data: any; error: any },
  fallback = "An unexpected error occurred"
): Promise<string> {
  if (!resp.error) return "";

  // Try to read the JSON body from the underlying Response (FunctionsHttpError)
  try {
    if (resp.error.context && typeof resp.error.context.json === "function") {
      const body = await resp.error.context.json();
      if (body?.error) return body.error;
    }
  } catch {
    // context.json() may fail if the body was already consumed
  }

  // Fall back to the SDK error message if it's not the generic one
  const msg = resp.error.message ?? resp.error?.toString?.() ?? "";
  if (msg && !msg.includes("non-2xx status code")) return msg;

  return fallback;
}

/** Friendly labels for common edge function error patterns */
const ERROR_HINTS: Record<string, string> = {
  "Unauthorized": "Your session may have expired. Please refresh the page and try again.",
  "Admin access required": "This action requires admin privileges.",
  "payment_required": "Lovable AI credits are exhausted. Please wait for credits to reset or upgrade your Lovable plan.",
  "Not enough credits": "Lovable AI credits are exhausted. Please wait for credits to reset or upgrade your Lovable plan.",
  "credit limit reached": "Lovable AI credits are exhausted. Please wait for credits to reset or upgrade your Lovable plan.",
  "No benchmark cases found": "No benchmark cases match the current filters. Create cases in the Vault first.",
  "No completed comparisons found": "Run benchmark comparisons first before generating patches.",
  "No failures found": "All comparisons matched — no prompt patches needed.",
  "comparison_id or agent_type required": "Internal error: missing parameters. Please report this bug.",
  "Comparison not found": "The selected comparison no longer exists. Refresh and try again.",
};

/**
 * Enrich a raw error string with a user-friendly hint if available.
 * Returns `{ title, description }` suitable for toast().
 */
export function friendlyEdgeFunctionError(
  rawError: string,
  operationTitle = "Operation failed"
): { title: string; description: string } {
  for (const [pattern, hint] of Object.entries(ERROR_HINTS)) {
    if (rawError.includes(pattern)) {
      return { title: operationTitle, description: hint };
    }
  }
  return { title: operationTitle, description: rawError };
}
