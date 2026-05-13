import { useEffect, useRef } from "react";

const TURNSTILE_SITE_KEY = "0x4AAAAAACkAWxd5xXDurE8t";
const SCRIPT_ID = "cf-turnstile-script";

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        }
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

function loadScript(): Promise<void> {
  return new Promise((resolve) => {
    if (window.turnstile) { resolve(); return; }
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) { existing.addEventListener("load", () => resolve()); return; }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

const TurnstileWidget = ({ onVerify, onExpire, onError }: TurnstileWidgetProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Store latest callbacks in refs to avoid re-render issues
  const cbRef = useRef({ onVerify, onExpire, onError });
  cbRef.current = { onVerify, onExpire, onError };

  // Skip Turnstile in dev/preview (headless browsers can't render it)
  const isDevOrPreview =
    import.meta.env.DEV ||
    window.location.hostname.includes("-preview--") ||
    window.location.hostname.includes(".lovableproject.com");

  useEffect(() => {
    if (isDevOrPreview) {
      // Auto-verify with a dummy token in dev/preview
      cbRef.current.onVerify("dev-bypass-token");
      return;
    }

    let cancelled = false;

    loadScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      // Clean up any previous widget (e.g. strict mode re-mount)
      if (widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token: string) => cbRef.current.onVerify(token),
        "expired-callback": () => cbRef.current.onExpire?.(),
        "error-callback": () => cbRef.current.onError?.(),
        theme: "auto",
      });
    });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [isDevOrPreview]);

  if (isDevOrPreview) {
    return (
      <div className="flex justify-center">
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full">✅ CAPTCHA bypassed (dev/preview)</span>
      </div>
    );
  }

  return <div ref={containerRef} className="flex justify-center overflow-hidden max-w-full [&>div]:scale-90 [&>div]:origin-center min-[340px]:[&>div]:scale-100" />;
};

export default TurnstileWidget;
