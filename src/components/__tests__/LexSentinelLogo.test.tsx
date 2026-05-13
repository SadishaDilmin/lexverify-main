import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import OlimeyLogo from "../LexSentinelLogo";

describe("OlimeyLogo", () => {
  it("renders the mark svg", () => {
    render(<OlimeyLogo />);
    expect(screen.getByRole("img", { name: "Olimey" })).toBeInTheDocument();
  });

  it("renders wordmark with full variant", () => {
    render(<OlimeyLogo variant="full" />);
    expect(screen.getByText("olimey")).toBeInTheDocument();
  });

  it("hides wordmark with icon variant", () => {
    render(<OlimeyLogo variant="icon" />);
    expect(screen.queryByText("olimey")).not.toBeInTheDocument();
  });

  it("renders mark-only via logoVariant", () => {
    render(<OlimeyLogo logoVariant="mark-only" />);
    expect(screen.queryByText("olimey")).not.toBeInTheDocument();
  });
});
