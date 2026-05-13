import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Check if the current user has already submitted a CMS access request.
 */
export function useCMSAccessRequest() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: existingRequest, isLoading } = useQuery({
    queryKey: ["cms_access_request", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("cms_access_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) return null;
      return data?.[0] ?? null;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const submitRequest = useMutation({
    mutationFn: async (message?: string) => {
      if (!user || !profile) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("cms_access_requests")
        .insert({
          user_id: user.id,
          user_email: profile.email,
          user_name: profile.full_name,
          firm_name: profile.firm_name || "",
          provider: "hoowla",
          message: message || "",
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms_access_request", user?.id] });
    },
  });

  return {
    existingRequest,
    isLoading,
    submitRequest,
    hasRequested: !!existingRequest,
    requestStatus: existingRequest?.status as string | undefined,
  };
}
