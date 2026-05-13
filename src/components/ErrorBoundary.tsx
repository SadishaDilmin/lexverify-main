import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const EB_SNAPSHOT_KEY = "ls_eb_crash_snapshot";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  /** Compact mode for tab-level boundaries (no full-page centering) */
  compact?: boolean;
  /** Optional key to scope the crash snapshot (e.g. caseId or reviewId) */
  snapshotKey?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const IS_PRODUCTION = import.meta.env.PROD;

/**
 * H4 Fix: Pre-crash save mechanism.
 * Reads all sessionStorage drafts and flushes them to localStorage
 * before the tree remounts, so useFormDraft can rehydrate from them.
 */
function flushDraftsToRecovery(snapshotKey?: string) {
  try {
    const snapshot: Record<string, string> = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith("ls-draft:")) {
        snapshot[key] = sessionStorage.getItem(key) || "";
      }
    }
    if (Object.keys(snapshot).length > 0) {
      const storageKey = snapshotKey
        ? `${EB_SNAPSHOT_KEY}:${snapshotKey}`
        : EB_SNAPSHOT_KEY;
      localStorage.setItem(storageKey, JSON.stringify({ snapshot, ts: Date.now() }));
    }
  } catch { /* non-critical */ }
}

/**
 * Restores drafts from a crash snapshot back into sessionStorage.
 * Called on retry so useFormDraft re-initializes with the saved data.
 */
function restoreDraftsFromRecovery(snapshotKey?: string) {
  try {
    const storageKey = snapshotKey
      ? `${EB_SNAPSHOT_KEY}:${snapshotKey}`
      : EB_SNAPSHOT_KEY;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const { snapshot, ts } = JSON.parse(raw);
    // Only restore if snapshot is less than 5 minutes old
    if (Date.now() - ts > 5 * 60 * 1000) {
      localStorage.removeItem(storageKey);
      return;
    }
    for (const [key, value] of Object.entries(snapshot)) {
      sessionStorage.setItem(key, value as string);
    }
    localStorage.removeItem(storageKey);
  } catch { /* non-critical */ }
}

/**
 * Catches render errors in child tree and shows a friendly recovery UI.
 * H2: In production, raw error messages are hidden from users.
 * H4: Flushes form drafts to localStorage before crash so retry can rehydrate.
 * H5: Supports compact mode for tab-level isolation.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Always log for debugging — safe for production (console only, not shown to user)
    console.error("[ErrorBoundary]", error, info.componentStack);
    // H4 Fix: Flush current drafts before the tree is destroyed on retry
    flushDraftsToRecovery(this.props.snapshotKey);
  }

  handleRetry = () => {
    // H4 Fix: Restore drafts into sessionStorage before remount
    restoreDraftsFromRecovery(this.props.snapshotKey);
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const isCompact = this.props.compact;

      return (
        <div className={`flex flex-col items-center justify-center text-center ${isCompact ? "py-10 px-4" : "py-20 px-6"}`}>
          <div className={`rounded-2xl bg-destructive/10 flex items-center justify-center mb-4 ${isCompact ? "w-10 h-10" : "w-14 h-14"}`}>
            <AlertTriangle size={isCompact ? 18 : 24} className="text-destructive" />
          </div>
          <h3 className={`font-semibold text-foreground mb-1 ${isCompact ? "text-sm" : "text-lg"}`}>
            {this.props.fallbackTitle || "Something went wrong"}
          </h3>
          <p className={`text-muted-foreground max-w-sm mb-5 leading-relaxed ${isCompact ? "text-xs" : "text-sm"}`}>
            {IS_PRODUCTION
              ? "An unexpected error occurred. Please try again or contact support if it persists."
              : `An unexpected error occurred. Please try again or contact support if it persists.`}
          </p>
          <Button onClick={this.handleRetry} variant="outline" size={isCompact ? "sm" : "default"} className="gap-2">
            <RefreshCw size={14} />
            Try again
          </Button>
          {/* Only show raw error details in development */}
          {!IS_PRODUCTION && this.state.error && (
            <pre className="mt-4 max-w-lg text-xs text-muted-foreground/60 overflow-auto whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
