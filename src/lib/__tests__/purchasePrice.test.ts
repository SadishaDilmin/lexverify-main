import { describe, it, expect } from "vitest";
import {
  parsePurchasePrice,
  sanitisePurchasePriceInput,
  formatPurchasePrice,
} from "@/lib/validation";

describe("parsePurchasePrice", () => {
  it("returns empty result for empty input", () => {
    expect(parsePurchasePrice("")).toEqual({ value: null, formatted: "", error: null, warning: null });
  });

  it("parses a plain digit string", () => {
    const r = parsePurchasePrice("200035");
    expect(r.value).toBe(200035);
    expect(r.formatted).toBe("200,035");
    expect(r.error).toBeNull();
  });

  it("parses a UK thousands-separated string", () => {
    const r = parsePurchasePrice("200,035");
    expect(r.value).toBe(200035);
    expect(r.formatted).toBe("200,035");
  });

  it("strips £ and trailing zero pence", () => {
    const r = parsePurchasePrice("£200,035.00");
    expect(r.value).toBe(200035);
    expect(r.formatted).toBe("200,035");
  });

  it("preserves real pence", () => {
    const r = parsePurchasePrice("£ 1,250,000.50 ");
    expect(r.value).toBe(1250000.5);
    expect(r.formatted).toBe("1,250,000.50");
  });

  it("rejects more than 2 decimal places", () => {
    const r = parsePurchasePrice("200,035.123");
    expect(r.error).toBe("Price has too many decimal places");
    expect(r.value).toBeNull();
  });

  it("rejects multiple dots", () => {
    const r = parsePurchasePrice("200.035.00");
    expect(r.error).toBe("Invalid price format");
    expect(r.value).toBeNull();
  });

  it("rejects non-numeric input", () => {
    const r = parsePurchasePrice("abc");
    expect(r.error).toBe("Invalid price format");
  });

  it("rejects zero and negatives", () => {
    expect(parsePurchasePrice("0").error).toBe("Price must be greater than zero");
    expect(parsePurchasePrice("-100").error).toBe("Price must be greater than zero");
  });

  it("rejects values below the hard floor", () => {
    expect(parsePurchasePrice("500").error).toBe("Price must be at least £1,000");
  });

  it("rejects values above the £10m hard ceiling", () => {
    expect(parsePurchasePrice("10000001").error).toBe("Price must be £10,000,000 or less");
  });

  it("accepts exactly £10,000,000 with a soft warning", () => {
    const r = parsePurchasePrice("10000000");
    expect(r.value).toBe(10_000_000);
    expect(r.error).toBeNull();
    expect(r.warning).toBe("Unusually high — please confirm");
  });

  it("warns on values between soft and hard upper band", () => {
    const r = parsePurchasePrice("6000000");
    expect(r.error).toBeNull();
    expect(r.warning).toBe("Unusually high — please confirm");
  });

  it("does not warn on values inside the typical band", () => {
    const r = parsePurchasePrice("4000000");
    expect(r.error).toBeNull();
    expect(r.warning).toBeNull();
  });

  it("warns on unusually low values within bounds", () => {
    const r = parsePurchasePrice("40000");
    expect(r.error).toBeNull();
    expect(r.warning).toBe("Unusually low — please confirm");
  });
});

describe("sanitisePurchasePriceInput", () => {
  it("keeps digits, one leading £, commas, spaces, and one dot", () => {
    expect(sanitisePurchasePriceInput("£200,035.00")).toBe("£200,035.00");
  });

  it("strips letters silently", () => {
    expect(sanitisePurchasePriceInput("200a035")).toBe("200035");
  });

  it("collapses multiple dots to the first one and limits to 2dp", () => {
    // 200.035.00 → strip extra dots → 200.03500 → trim to 2dp → 200.03
    expect(sanitisePurchasePriceInput("200.035.00")).toBe("200.03");
  });

  it("limits to 2 decimal places during typing", () => {
    expect(sanitisePurchasePriceInput("100.123")).toBe("100.12");
  });

  it("only allows £ at position 0", () => {
    expect(sanitisePurchasePriceInput("200£035")).toBe("200035");
  });
});

describe("formatPurchasePrice", () => {
  it("formats whole pounds without decimals", () => {
    expect(formatPurchasePrice(200035)).toBe("200,035");
  });

  it("formats pence with 2 decimals", () => {
    expect(formatPurchasePrice(1250000.5)).toBe("1,250,000.50");
  });
});
