import { lazy, Suspense, useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import AppRoutes from "@/routes/AppRoutes";

const SupportChatWidget = lazy(() => import("./components/SupportChatWidget"));
import NetworkStatus from "@/components/NetworkStatus";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const status = (error as any)?.status ?? (error as any)?.code;
        if (status === 401 || status === 403) return false;
        return failureCount < 3;
      },
      retryDelay: (attempt) => Math.min(1000 * Math.pow(2, attempt), 30_000),
    },
    mutations: {
      retry: (failureCount, error) => {
        const status = (error as any)?.status ?? (error as any)?.code;
        if (status === 401 || status === 403) return false;
        return failureCount < 3;
      },
      retryDelay: (attempt) => Math.min(1000 * Math.pow(2, attempt), 30_000),
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-pulse text-muted-foreground">Loading…</div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <AppRoutes />
            </Suspense>
          </ErrorBoundary>
          <DeferredChatWidget />
          <NetworkStatus />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

/** Load SupportChatWidget after the main thread is idle */
function DeferredChatWidget() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(() => setReady(true), { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(() => setReady(true), 2000);
    return () => clearTimeout(t);
  }, []);
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <SupportChatWidget />
    </Suspense>
  );
}

export default App;
