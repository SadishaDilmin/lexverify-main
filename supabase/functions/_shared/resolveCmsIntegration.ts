export interface CmsIntegrationRecord {
  id: string;
  provider: string;
  firm_name: string;
  api_base_url: string;
  api_key_encrypted: string;
  provider_user_email: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ResolveCmsIntegrationParams {
  provider?: string;
  userId: string;
  profileEmail?: string | null;
  profileFirmName?: string | null;
}

interface ResolveCmsIntegrationResult {
  integration: CmsIntegrationRecord | null;
  matchType: "created_by" | "provider_user_email" | "email_domain" | "firm_name" | "ambiguous" | null;
}

function normalizeText(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getEmailDomain(email?: string | null) {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized.includes("@")) return null;
  return normalized.split("@")[1] || null;
}

export async function resolveActiveCmsIntegration(
  adminClient: any,
  { provider = "hoowla", userId, profileEmail, profileFirmName }: ResolveCmsIntegrationParams,
): Promise<ResolveCmsIntegrationResult> {
  const { data, error } = await adminClient
    .from("cms_integrations")
    .select("*")
    .eq("provider", provider)
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  const integrations = ((data ?? []) as CmsIntegrationRecord[]).filter(Boolean);
  if (integrations.length === 0) {
    return { integration: null, matchType: null };
  }

  const normalizedEmail = (profileEmail ?? "").trim().toLowerCase();
  const emailDomain = getEmailDomain(normalizedEmail);
  const normalizedFirmName = normalizeText(profileFirmName);

  const ranked = integrations
    .map((integration) => {
      const providerEmail = (integration.provider_user_email ?? "").trim().toLowerCase();
      const providerDomain = getEmailDomain(providerEmail);
      const integrationFirmName = normalizeText(integration.firm_name);
      let score = 0;
      let matchType: ResolveCmsIntegrationResult["matchType"] = null;

      if (integration.created_by === userId) {
        score = 100;
        matchType = "created_by";
      } else if (normalizedEmail && providerEmail && normalizedEmail === providerEmail) {
        score = 90;
        matchType = "provider_user_email";
      } else if (emailDomain && providerDomain && emailDomain === providerDomain) {
        score = 70;
        matchType = "email_domain";
      } else if (normalizedFirmName && integrationFirmName && normalizedFirmName === integrationFirmName) {
        score = 50;
        matchType = "firm_name";
      }

      return { integration, score, matchType };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return { integration: null, matchType: null };
  }

  const [best, second] = ranked;
  if (second && second.score === best.score && best.score < 100) {
    return { integration: null, matchType: "ambiguous" };
  }

  return { integration: best.integration, matchType: best.matchType };
}
