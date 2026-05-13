/**
 * Normalises a property address string:
 * - Strips parentheses/brackets around postcodes
 * - Removes extra whitespace and trailing commas
 * - Separates components by comma
 *
 * Example: "12 The Rye, Eaton Bray (LU6 2BQ)" → "12 The Rye, Eaton Bray, LU6 2BQ"
 */
export function formatAddress(raw: string): string {
  let s = raw.trim();
  if (!s) return s;

  // Replace parentheses / square brackets wrapping a postcode-like segment with ", content"
  // Matches patterns like (LU6 2BQ) or [SW1A 1AA]
  s = s.replace(/\s*[\(\[]\s*([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*[\)\]]\s*/gi, ", $1, ");

  // Normalise multiple commas / semicolons into single commas
  s = s.replace(/[;]+/g, ",");
  s = s.replace(/,{2,}/g, ",");

  // Ensure space after each comma
  s = s.replace(/,\s*/g, ", ");

  // Collapse multiple spaces
  s = s.replace(/\s{2,}/g, " ");

  // Remove leading/trailing commas and whitespace
  s = s.replace(/^[,\s]+|[,\s]+$/g, "");

  return s;
}
