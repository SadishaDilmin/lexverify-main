/**
 * Retry wrapper for async operations with exponential backoff.
 * Designed for transient upload failures (network glitches, 5xx errors).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  {
    maxAttempts = 3,
    baseDelayMs = 1000,
    onRetry,
  }: {
    maxAttempts?: number;
    baseDelayMs?: number;
    /** Called before each retry with the upcoming attempt number and max. */
    onRetry?: (attempt: number, maxAttempts: number) => void;
  } = {}
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`[retry] Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms…`, err);
        onRetry?.(attempt + 1, maxAttempts);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}
