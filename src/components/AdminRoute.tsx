import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { roleRank } from "@/lib/roleHierarchy";

interface AdminRouteProps {
  children: React.ReactNode;
  /** Minimum role required. Defaults to "auditor" (view-only admin access). */
  minRole?: "super_admin" | "admin" | "support_admin" | "auditor";
}

/**
 * AdminRoute — wraps ProtectedRoute with a rank-based role check.
 * Supports full hierarchy: admin > support_admin > auditor > user.
 * By default requires at least "auditor" level to access admin pages.
 */
const AdminRoute = ({ children, minRole = "auditor" }: AdminRouteProps) => {
  return (
    <ProtectedRoute>
      <AdminGate minRole={minRole}>{children}</AdminGate>
    </ProtectedRoute>
  );
};

/** Inner gate that runs after ProtectedRoute has confirmed session + profile */
const AdminGate = ({ children, minRole }: { children: React.ReactNode; minRole: string }) => {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Verifying access…</div>
      </div>
    );
  }

  if (!role || roleRank(role) < roleRank(minRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
