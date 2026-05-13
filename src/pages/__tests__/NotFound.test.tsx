import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NotFound from "../NotFound";

describe("NotFound", () => {
  it("renders 404 heading", () => {
    render(<MemoryRouter><NotFound /></MemoryRouter>);
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("renders page not found message", () => {
    render(<MemoryRouter><NotFound /></MemoryRouter>);
    expect(screen.getByText("Oops! Page not found")).toBeInTheDocument();
  });

  it("renders return home link", () => {
    render(<MemoryRouter><NotFound /></MemoryRouter>);
    const link = screen.getByText("Return to Home");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });
});
