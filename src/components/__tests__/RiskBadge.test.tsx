import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RiskBadge from "../RiskBadge";

describe("RiskBadge", () => {
  it("renders green level with capitalised label", () => {
    render(<RiskBadge level="green" />);
    expect(screen.getByText("Green")).toBeInTheDocument();
  });

  it("renders amber level", () => {
    render(<RiskBadge level="amber" />);
    expect(screen.getByText("Amber")).toBeInTheDocument();
  });

  it("renders red level", () => {
    render(<RiskBadge level="red" />);
    expect(screen.getByText("Red")).toBeInTheDocument();
  });

  it("displays score when provided", () => {
    render(<RiskBadge level="amber" score={72} />);
    expect(screen.getByText("(72)")).toBeInTheDocument();
  });

  it("does not display score when omitted", () => {
    render(<RiskBadge level="green" />);
    expect(screen.queryByText(/\(\d+\)/)).not.toBeInTheDocument();
  });

  it("applies sm size classes", () => {
    const { container } = render(<RiskBadge level="red" size="sm" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain("text-xs");
  });
});
