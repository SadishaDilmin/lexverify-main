import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/extract-doc-summaries`;

Deno.test("extract-doc-summaries: rejects empty files array", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ files: [] }),
  });

  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.error, "No files provided");
});

Deno.test("extract-doc-summaries: extracts text from a simple text-based file", async () => {
  // Create a simple text file as base64
  const textContent = "This is a sample bank statement.\nAccount: 12345678\nBalance: £10,500.00\nTransaction: Direct Debit - £250.00\nTransaction: Salary Credit - £3,200.00\nDate: 01/03/2026";
  const base64 = btoa(textContent);

  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      files: [{ base64, name: "bank-statement.txt", mimeType: "text/plain" }],
    }),
  });

  assertEquals(response.status, 200);
  const body = await response.json();
  assertExists(body.summaries);
  assertEquals(body.summaries.length, 1);
  assertEquals(body.summaries[0].name, "bank-statement.txt");
  // Should contain extracted text
  const summary: string = body.summaries[0].summary;
  assertEquals(summary.includes("10,500"), true, `Expected summary to contain "10,500" but got: ${summary.slice(0, 200)}`);
  assertEquals(summary.includes("3,200"), true, `Expected summary to contain "3,200" but got: ${summary.slice(0, 200)}`);
});

Deno.test("extract-doc-summaries: classifies financial filenames correctly", async () => {
  const textContent = "Armalytix Source of Funds Report\nClient: John Smith\nTotal Income: £85,000\nDeposit Source: Savings £50,000\nMortgage: £200,000";
  const base64 = btoa(textContent);

  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      files: [{ base64, name: "Armalytix_Source_of_Funds.txt", mimeType: "text/plain" }],
    }),
  });

  assertEquals(response.status, 200);
  const body = await response.json();
  assertExists(body.summaries);
  const classification = body.summaries[0].classification;
  // Should be classified as open_banking_report or financial_statement
  const validClassifications = ["open_banking_report", "financial_statement"];
  assertEquals(validClassifications.includes(classification), true);
  await response.text().catch(() => {}); // consume body
});
