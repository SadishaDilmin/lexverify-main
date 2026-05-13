import { createContext, useContext, useEffect, useState, useMemo, useCallback, ReactNode } from "react";
import type { AppRole } from "@/lib/roleHierarchy";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  position: string;
  firm_name: string;
  active: boolean;
  ai_disclaimer_accepted_at: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  role: null as AppRole | null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

/* ── Cache helpers ── */
const CACHE_KEY_PROFILE = "ls_cached_profile";
const CACHE_KEY_ROLE = "ls_cached_role";
const CACHE_TTL_MS = 30_000; // 30 seconds — reduced from 5 min to shrink privilege escalation window

interface CachedItem<T> {
  data: T;
  ts: number;
  userId: string;
}

function getCached<T>(key: string, userId: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: CachedItem<T> = JSON.parse(raw);
    if (parsed.userId !== userId) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function setCache<T>(key: string, userId: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now(), userId }));
  } catch { /* quota — non-critical */ }
}

function clearCache() {
  localStorage.removeItem(CACHE_KEY_PROFILE);
  localStorage.removeItem(CACHE_KEY_ROLE);
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    // Try cache first for <200ms hydration
    const cached = getCached<Profile>(CACHE_KEY_PROFILE, userId);
    if (cached) {
      setProfile(cached);
    }

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    const p = data as Profile | null;
    setProfile(p);
    if (p) setCache(CACHE_KEY_PROFILE, userId, p);
  }, []);

  const fetchRole = useCallback(async (userId: string) => {
    // Try cache first
    const cached = getCached<AppRole>(CACHE_KEY_ROLE, userId);
    if (cached) {
      setRole(cached);
    }

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    const r = (data?.role as AppRole) ?? "user";
    setRole(r);
    setCache(CACHE_KEY_ROLE, userId, r);
  }, []);

  const hydrate = useCallback(async (userId: string) => {
    try {
      await Promise.all([fetchProfile(userId), fetchRole(userId)]);
    } catch (e) {
      console.error("Failed to fetch profile/role:", e);
    } finally {
      setLoading(false);
    }
  }, [fetchProfile, fetchRole]);

  useEffect(() => {
    // Set up listener FIRST (per Supabase best practices)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          // Defer to avoid blocking the auth callback
          setTimeout(() => hydrate(session.user.id), 0);
        } else {
          setProfile(null);
          setRole(null);
          setLoading(false);
        }
      }
    );

    // Then get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        hydrate(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [hydrate]);

  // C3 Fix: Revalidate role on tab focus and cross-tab storage invalidation
  useEffect(() => {
    if (!user) return;

    const onFocus = () => {
      // Defer role re-fetch to idle time so it doesn't block UI during heavy state transitions
      if ("requestIdleCallback" in window) {
        (window as any).requestIdleCallback(() => fetchRole(user.id), { timeout: 2000 });
      } else {
        setTimeout(() => fetchRole(user.id), 100);
      }
    };

    const onStorage = (e: StorageEvent) => {
      // Another tab cleared the role cache → re-fetch immediately
      if (e.key === CACHE_KEY_ROLE && e.newValue === null) {
        fetchRole(user.id);
      }
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [user, fetchRole]);

  const signOut = useCallback(async () => {
    localStorage.removeItem("ls_disclaimer_accepted");
    clearCache();
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setRole(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  }, [user, fetchProfile]);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo<AuthContextType>(() => ({
    session, user, profile, role, loading, signOut, refreshProfile,
  }), [session, user, profile, role, loading, signOut, refreshProfile]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
