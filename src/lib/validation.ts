/**
 * Shared validation helpers for form inputs across the app.
 * All patterns use UK conventions.
 */

/** Only letters, spaces, hyphens, apostrophes — no digits or special chars */
const NAME_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ' \-]+$/;

/** UK phone: 07/01/02/03/08/00 or +44, 10-15 digits total */
const UK_PHONE_REGEX = /^(?:\+44|0)\d{9,13}$/;

/** Basic email shape — browser type="email" handles most, this adds belt-and-braces */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ── Sanitisers ────────────────────────────────────────────────────────

/** Strip all HTML tags from a string to prevent stored XSS */
export function stripHtmlTags(raw: string): string {
  return raw.replace(/<[^>]*>/g, "").replace(/&[a-zA-Z]+;/g, "");
}

/** Strip everything except digits, +, spaces from a phone string */
export function sanitisePhone(raw: string): string {
  return raw.replace(/[^\d+\s]/g, "");
}

/** Strip leading/trailing whitespace and collapse internal runs */
export function sanitiseName(raw: string): string {
  return raw.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' \-]/g, "").replace(/\s{2,}/g, " ");
}

/** Sanitise position: strip HTML, limit to safe characters (letters, spaces, hyphens, ampersands, parentheses, dots) */
export function sanitisePosition(raw: string): string {
  return stripHtmlTags(raw)
    .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' \-&().]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 200);
}

// ── Validators (return error message or empty string) ─────────────────

export function validateName(value: string, label = "Name"): string {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required`;
  if (trimmed.length < 2) return `${label} must be at least 2 characters`;
  if (trimmed.length > 200) return `${label} must be under 200 characters`;
  if (!NAME_REGEX.test(trimmed)) return `${label} must contain only letters, spaces, hyphens and apostrophes`;
  return "";
}

/** Free/consumer email domains that are not accepted for professional registration */
const BLOCKED_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com",
  "hotmail.co.uk", "outlook.com", "live.com", "live.co.uk", "msn.com",
  "aol.com", "icloud.com", "me.com", "mac.com", "mail.com", "zoho.com",
  "protonmail.com", "proton.me", "ymail.com", "gmx.com", "gmx.co.uk",
  "fastmail.com", "tutanota.com", "tuta.io", "inbox.com", "rediffmail.com",
  "btinternet.com", "sky.com", "virginmedia.com", "talktalk.net",
  "plusnet.com", "ntlworld.com",
]);

export function validateEmail(value: string, label = "Email"): string {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required`;
  if (trimmed.length > 255) return `${label} must be under 255 characters`;
  if (!EMAIL_REGEX.test(trimmed)) return `Please enter a valid email address`;
  return "";
}

/** Checks that the email domain belongs to a professional firm, not a free provider */
export function validateProfessionalEmail(value: string): string {
  const basic = validateEmail(value);
  if (basic) return basic;
  const domain = value.trim().split("@")[1]?.toLowerCase();
  if (domain && BLOCKED_EMAIL_DOMAINS.has(domain)) {
    return "Please use your law firm email address. Personal email domains are not accepted.";
  }
  return "";
}

export function validatePhone(value: string, required = false, label = "Phone number"): string {
  const digits = value.replace(/[\s\-()]/g, "");
  if (!digits) return required ? `${label} is required` : "";
  if (!UK_PHONE_REGEX.test(digits)) return `Please enter a valid UK phone number (e.g. 07700 900000)`;
  return "";
}

export function validatePassword(value: string): string {
  if (!value) return "Password is required";
  if (value.length < 8) return "Password must be at least 8 characters";
  return "";
}

export function validateFirmName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Firm name is required";
  if (trimmed.length > 200) return "Firm name must be under 200 characters";
  return "";
}

export function validatePosition(value: string): string {
  const trimmed = stripHtmlTags(value).trim();
  if (!trimmed) return "Position is required";
  if (trimmed.length > 200) return "Position must be under 200 characters";
  if (/[<>{}]/.test(trimmed)) return "Position contains invalid characters";
  if (/\d/.test(trimmed)) return "Position should not contain numbers";
  return "";
}

/** Generic max-length text field */
export function validateText(value: string, maxLength = 1000, label = "Field"): string {
  if (value.length > maxLength) return `${label} must be under ${maxLength} characters`;
  return "";
}

// ── Purchase price (UK currency) ──────────────────────────────────────

export interface PurchasePriceParseResult {
  /** Canonical numeric pounds value, rounded to 2dp. null if input is empty. */
  value: number | null;
  /** UK thousands-separated string (no currency symbol). Empty if value is null. */
  formatted: string;
  /** Hard validation error — submit must be blocked. */
  error: string | null;
  /** Soft warning — submit allowed but operator should confirm. */
  warning: string | null;
}

const PRICE_HARD_MIN = 1_000;
const PRICE_HARD_MAX = 10_000_000;
const PRICE_SOFT_MIN = 50_000;
const PRICE_SOFT_MAX = 5_000_000;

/**
 * Sanitise a single keystroke / paste into the purchase price field.
 * Keeps digits, an optional leading £, commas, spaces, and at most one dot.
 * Drops everything else silently so the caret does not jump.
 */
export function sanitisePurchasePriceInput(raw: string): string {
  if (!raw) return "";
  // Keep only allowed characters
  let cleaned = raw.replace(/[^\d£,.\s]/g, "");
  // Only one leading £ permitted
  cleaned = cleaned.replace(/£/g, (_match, offset) => (offset === 0 ? "£" : ""));
  // Collapse multiple dots to the first one only
  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    const head = cleaned.slice(0, firstDot + 1);
    const tail = cleaned.slice(firstDot + 1).replace(/\./g, "");
    cleaned = head + tail;
  }
  // Limit to 2 decimal places during typing
  if (firstDot !== -1) {
    const [intPart, decPart = ""] = cleaned.split(".");
    cleaned = intPart + "." + decPart.slice(0, 2);
  }
  return cleaned;
}

/**
 * Format a numeric pounds value as a UK thousands-separated string.
 * No currency symbol. Trailing zero pence are dropped (e.g. 200035.00 → "200,035").
 */
export function formatPurchasePrice(value: number): string {
  if (!Number.isFinite(value)) return "";
  const hasFraction = Math.round(value * 100) % 100 !== 0;
  return value.toLocaleString("en-GB", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Parse a free-form purchase price string into a canonical numeric value
 * with hard error and soft warning classification. Pure function — no React.
 */
export function parsePurchasePrice(raw: string): PurchasePriceParseResult {
  const empty: PurchasePriceParseResult = { value: null, formatted: "", error: null, warning: null };
  if (raw == null) return empty;

  // Strip £, whitespace, and commas. Anything else here is unexpected.
  const stripped = String(raw).replace(/[£\s,]/g, "");
  if (stripped === "") return empty;

  // Reject negatives explicitly so the digit-only check below stays simple
  if (stripped.startsWith("-")) {
    return { ...empty, error: "Price must be greater than zero" };
  }

  // Must be digits with at most one dot
  if (!/^\d+(\.\d+)?$/.test(stripped)) {
    return { ...empty, error: "Invalid price format" };
  }

  // Decimal places ≤ 2
  const dotIdx = stripped.indexOf(".");
  if (dotIdx !== -1) {
    const decPart = stripped.slice(dotIdx + 1);
    if (decPart.length > 2) {
      return { ...empty, error: "Price has too many decimal places" };
    }
  }

  const numeric = Number(stripped);
  if (!Number.isFinite(numeric)) {
    return { ...empty, error: "Invalid price format" };
  }
  // Round to nearest pence to avoid floating drift
  const value = Math.round(numeric * 100) / 100;

  if (value <= 0) {
    return { ...empty, error: "Price must be greater than zero" };
  }
  if (value < PRICE_HARD_MIN) {
    return { ...empty, error: `Price must be at least £${PRICE_HARD_MIN.toLocaleString("en-GB")}` };
  }
  if (value > PRICE_HARD_MAX) {
    return { ...empty, error: `Price must be £${PRICE_HARD_MAX.toLocaleString("en-GB")} or less` };
  }

  let warning: string | null = null;
  if (value < PRICE_SOFT_MIN) warning = "Unusually low — please confirm";
  else if (value > PRICE_SOFT_MAX) warning = "Unusually high — please confirm";

  return {
    value,
    formatted: formatPurchasePrice(value),
    error: null,
    warning,
  };
}
