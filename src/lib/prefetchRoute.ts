/**
 * Prefetch a lazily-loaded route module on hover / pointer-enter.
 * Uses dynamic import() which Vite splits into separate chunks.
 *
 * Usage:
 *   onMouseEnter={() => prefetchRoute(() => import("@/pages/CaseWorkspace"))}
 */
const prefetched = new Set<string>();

export function prefetchRoute(loader: () => Promise<unknown>) {
  const key = loader.toString();
  if (prefetched.has(key)) return;
  prefetched.add(key);
  // Fire-and-forget — failure is non-critical
  loader().catch(() => prefetched.delete(key));
}
