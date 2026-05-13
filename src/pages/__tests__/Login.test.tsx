import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock AuthContext
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ session: null, loading: false }),
}));

// Mock supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

import Login from "../Login";

const renderLogin = () =>
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );

describe("Login", () => {
  it("renders sign in heading", () => {
    renderLogin();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("renders email and password inputs", () => {
    renderLogin();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("renders sign in button", () => {
    renderLogin();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("renders forgot password link", () => {
    renderLogin();
    expect(screen.getByText("Forgot password?")).toBeInTheDocument();
  });

  it("renders create account link", () => {
    renderLogin();
    expect(screen.getByText("Create account")).toBeInTheDocument();
  });

  it("renders request access link", () => {
    renderLogin();
    expect(screen.getByText("Request access")).toBeInTheDocument();
  });

  it("renders Olimey AI branding", () => {
    renderLogin();
    // The left panel has the branding text
    expect(screen.getByText(/Risk intelligence for conveyancing/i)).toBeInTheDocument();
  });
});
