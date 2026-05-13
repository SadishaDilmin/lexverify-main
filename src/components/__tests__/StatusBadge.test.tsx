import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusBadge from "../StatusBadge";

describe("StatusBadge", () => {
  it("renders Open for open status", () => {
    render(<StatusBadge status="open" />);
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("renders Docs Pending for documents_pending", () => {
    render(<StatusBadge status="documents_pending" />);
    expect(screen.getByText("Docs Pending")).toBeInTheDocument();
  });

  it("renders Review Ready", () => {
    render(<StatusBadge status="review_ready" />);
    expect(screen.getByText("Review Ready")).toBeInTheDocument();
  });

  it("renders Review Complete", () => {
    render(<StatusBadge status="review_complete" />);
    expect(screen.getByText("Review Complete")).toBeInTheDocument();
  });

  it("renders Closed", () => {
    render(<StatusBadge status="closed" />);
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });
});
