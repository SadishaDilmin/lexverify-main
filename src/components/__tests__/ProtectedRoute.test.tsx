import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({}) }),
      insert: () => Promise.resolve({}),
    }),
  },
}));

// Mock AiDisclaimerDialog
vi.mock("@/components/AiDisclaimerDialog", () => ({
  default: ({ open, onAccept }: { open: boolean; onAccept: () => void }) =>
    open ? <div data-testid="disclaimer-dialog"><button onClick={onAccept}>Accept</button></div> : null,
}));

import ProtectedRoute from "../ProtectedRoute";

const renderWithRouter = (ui: React.ReactNode) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe("ProtectedRoute", () => {
  it("shows loading state when auth is loading", () => {
    mockUseAuth.mockReturnValue({ session: null, loading: true, profile: null, user: null });
    renderWithRouter(<ProtectedRoute><div>Protected</div></ProtectedRoute>);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("redirects to login when no session", () => {
    mockUseAuth.mockReturnValue({ session: null, loading: false, profile: null, user: null });
    const { container } = renderWithRouter(<ProtectedRoute><div>Protected</div></ProtectedRoute>);
    // Navigate component renders nothing visible
    expect(screen.queryByText("Protected")).not.toBeInTheDocument();
  });

  it("shows disclaimer dialog when session exists but not accepted", () => {
    mockUseAuth.mockReturnValue({
      session: { access_token: "test-token-123" },
      loading: false,
      profile: { full_name: "Test", email: "test@test.com", position: "Dev", active: true, ai_disclaimer_accepted_at: null },
      user: { id: "user-1", email: "test@test.com" },
    });
    renderWithRouter(<ProtectedRoute><div>Protected</div></ProtectedRoute>);
    expect(screen.getByTestId("disclaimer-dialog")).toBeInTheDocument();
    expect(screen.queryByText("Protected")).not.toBeInTheDocument();
  });

  it("renders children after disclaimer is accepted", async () => {
    mockUseAuth.mockReturnValue({
      session: { access_token: "test-token-123" },
      loading: false,
      profile: { full_name: "Test", email: "test@test.com", position: "Dev", active: true, ai_disclaimer_accepted_at: null },
      user: { id: "user-1", email: "test@test.com" },
    });
    renderWithRouter(<ProtectedRoute><div>Protected</div></ProtectedRoute>);
    
    const acceptBtn = screen.getByText("Accept");
    acceptBtn.click();
    
    // After accepting, children should render
    expect(await screen.findByText("Protected")).toBeInTheDocument();
  });
});
