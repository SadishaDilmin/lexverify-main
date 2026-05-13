import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

/**
 * Extracted flag detection logic from sync-hoowla for unit testing.
 * This mirrors the exact regex + filtering logic used in the edge function.
 */

interface CustomField {
  casedetail_slug: string;
  casedetail_value: string | null;
}

function detectCaseFlags(
  caseName: string,
  caseTypeName: string,
  customFields: CustomField[]
): string[] {
  const caseFlags: string[] = [];
  const caseText = `${caseName} ${caseTypeName}`.toLowerCase();

  const cfValues = customFields
    .filter((f) => {
      const v = String(f.casedetail_value ?? "").trim().toLowerCase();
      return v && !["0", "1", "yes", "no", "true", "false", ""].includes(v);
    })
    .map((f) => String(f.casedetail_value).toLowerCase());
  const cfValueText = cfValues.join(" ");

  const cfBooleanYes = (slugPattern: RegExp) =>
    customFields.some((f) => {
      const slug = (f.casedetail_slug || "").toLowerCase();
      const val = String(f.casedetail_value ?? "").trim().toLowerCase();
      return slugPattern.test(slug) && (val === "1" || val === "yes" || val === "true");
    });

  if (cfBooleanYes(/newly.?built|new.?build/i) || /new.?build|new.?home|nhbc/i.test(caseText) || /new.?build|nhbc/i.test(cfValueText)) {
    caseFlags.push("new-build");
  }
  if (/building.?safety.?act|bsa.?compliance/i.test(caseText + " " + cfValueText) || cfBooleanYes(/building.?safety/i)) {
    caseFlags.push("bsa");
  }
  if (/auction/i.test(caseText + " " + cfValueText) || cfBooleanYes(/auction/i)) {
    caseFlags.push("auction");
  }
  if (/right.?to.?buy|rtb/i.test(caseText + " " + cfValueText) || cfBooleanYes(/right.?to.?buy/i)) {
    caseFlags.push("right-to-buy");
  }
  if (/shared.?ownership|housing.?association/i.test(caseText + " " + cfValueText) || cfBooleanYes(/shared.?ownership/i)) {
    caseFlags.push("shared-ownership");
    if (/staircas/i.test(caseText + " " + cfValueText)) {
      caseFlags.push("staircasing");
    }
  }
  if (/\bunregistered\b/i.test(caseText + " " + cfValueText) || cfBooleanYes(/unregistered/i)) {
    caseFlags.push("unregistered");
  }

  return caseFlags;
}

// ── FALSE POSITIVE TESTS (regression guards) ──

Deno.test("BSA: slug 'fo-registered-with-title-absolute' should NOT trigger BSA", () => {
  const flags = detectCaseFlags("19B Dunlace Road", "Conveyancing", [
    { casedetail_slug: "173746-fo-registered-with-title-absolute", casedetail_value: "" },
    { casedetail_slug: "173746-lo-registered-with-good-leasehold-title", casedetail_value: "" },
  ]);
  assertEquals(flags.includes("bsa"), false);
});

Deno.test("BSA: slug with 'remediation' value should NOT trigger BSA", () => {
  const flags = detectCaseFlags("10 High Street", "Conveyancing", [
    { casedetail_slug: "some-field", casedetail_value: "remediation needed" },
  ]);
  assertEquals(flags.includes("bsa"), false);
});

Deno.test("Unregistered: slug 'fo-registered-with-possessory-title' should NOT trigger unregistered", () => {
  const flags = detectCaseFlags("19B Dunlace Road", "Conveyancing", [
    { casedetail_slug: "173746-fo-registered-with-possessory-title", casedetail_value: "" },
    { casedetail_slug: "173746-fo-registered-with-qualified-title", casedetail_value: "" },
  ]);
  assertEquals(flags.includes("unregistered"), false);
});

Deno.test("Unregistered: value 'registered' should NOT trigger unregistered", () => {
  const flags = detectCaseFlags("10 Main Road", "Conveyancing", [
    { casedetail_slug: "title-status", casedetail_value: "registered" },
  ]);
  assertEquals(flags.includes("unregistered"), false);
});

Deno.test("No flags: standard leasehold purchase with typical slugs", () => {
  const flags = detectCaseFlags("19B Dunlace Road, London, E5 0NF", "Conveyancing", [
    { casedetail_slug: "173746-fo-registered-with-title-absolute", casedetail_value: "" },
    { casedetail_slug: "173746-lo-registered-with-title-absolute", casedetail_value: "" },
    { casedetail_slug: "173746-is-this-a-newly-built-property-y", casedetail_value: "0" },
    { casedetail_slug: "173746-is-this-a-newly-built-property-n", casedetail_value: "0" },
    { casedetail_slug: "173746-lc-property-adequately-defined", casedetail_value: "" },
    { casedetail_slug: "173746-raf-is-the-client-personally-known", casedetail_value: "Existing Client" },
  ]);
  assertEquals(flags, []);
});

// ── TRUE POSITIVE TESTS ──

Deno.test("BSA: explicit 'Building Safety Act' in case name triggers bsa", () => {
  const flags = detectCaseFlags("42 Tower Block - Building Safety Act", "Conveyancing", []);
  assertEquals(flags.includes("bsa"), true);
});

Deno.test("BSA: 'bsa compliance' in custom field value triggers bsa", () => {
  const flags = detectCaseFlags("42 Tower Block", "Conveyancing", [
    { casedetail_slug: "compliance-notes", casedetail_value: "BSA compliance required" },
  ]);
  assertEquals(flags.includes("bsa"), true);
});

Deno.test("BSA: boolean slug 'building-safety' with value '1' triggers bsa", () => {
  const flags = detectCaseFlags("42 Tower Block", "Conveyancing", [
    { casedetail_slug: "building-safety-applicable", casedetail_value: "1" },
  ]);
  assertEquals(flags.includes("bsa"), true);
});

Deno.test("Unregistered: explicit 'unregistered' in case name triggers flag", () => {
  const flags = detectCaseFlags("Unregistered Land at 5 Farm Lane", "Conveyancing", []);
  assertEquals(flags.includes("unregistered"), true);
});

Deno.test("Unregistered: 'unregistered' in custom field value triggers flag", () => {
  const flags = detectCaseFlags("5 Farm Lane", "Conveyancing", [
    { casedetail_slug: "land-status", casedetail_value: "unregistered" },
  ]);
  assertEquals(flags.includes("unregistered"), true);
});

Deno.test("Unregistered: boolean slug with value 'yes' triggers flag", () => {
  const flags = detectCaseFlags("5 Farm Lane", "Conveyancing", [
    { casedetail_slug: "is-unregistered-land", casedetail_value: "yes" },
  ]);
  assertEquals(flags.includes("unregistered"), true);
});

// ── OTHER FLAGS ──

Deno.test("New Build: boolean slug triggers new-build", () => {
  const flags = detectCaseFlags("Plot 4, New Estate", "Conveyancing", [
    { casedetail_slug: "is-this-a-newly-built-property-y", casedetail_value: "1" },
  ]);
  assertEquals(flags.includes("new-build"), true);
});

Deno.test("New Build: 'NHBC' in case name triggers new-build", () => {
  const flags = detectCaseFlags("Plot 4 NHBC warranty", "Conveyancing", []);
  assertEquals(flags.includes("new-build"), true);
});

Deno.test("Auction: case name containing 'auction' triggers flag", () => {
  const flags = detectCaseFlags("Auction Purchase - 10 High St", "Conveyancing", []);
  assertEquals(flags.includes("auction"), true);
});

Deno.test("Right to Buy: 'RTB' in custom field triggers flag", () => {
  const flags = detectCaseFlags("10 Council Estate", "Conveyancing", [
    { casedetail_slug: "purchase-type", casedetail_value: "RTB application" },
  ]);
  assertEquals(flags.includes("right-to-buy"), true);
});

Deno.test("Shared Ownership: housing association in case text triggers flag", () => {
  const flags = detectCaseFlags("Housing Association Purchase", "Conveyancing", []);
  assertEquals(flags.includes("shared-ownership"), true);
});

Deno.test("Boolean fields with '0' or 'no' should NOT trigger flags", () => {
  const flags = detectCaseFlags("10 Main Street", "Conveyancing", [
    { casedetail_slug: "is-this-a-newly-built-property-y", casedetail_value: "0" },
    { casedetail_slug: "building-safety-applicable", casedetail_value: "no" },
    { casedetail_slug: "is-unregistered-land", casedetail_value: "false" },
    { casedetail_slug: "auction-purchase", casedetail_value: "0" },
  ]);
  assertEquals(flags, []);
});

// ── ADD-ON DETECTION TESTS ──

const mgmtPackPattern = /management.?pack|lpe.?1|landlord.*enquir|leasehold.*property.*enquir|service.?charge.?pack/i;
const licenceToAlterPattern = /licen[cs]e.?to.?alter|licence.?for.?alteration|alteration.?licen[cs]e/i;

function detectAddOns(customFields: CustomField[], docNames: string[] = []): string[] {
  const addOns: string[] = [];

  // Doc list scanning
  if (docNames.some((n) => mgmtPackPattern.test(n))) addOns.push("management-pack");
  if (docNames.some((n) => licenceToAlterPattern.test(n))) addOns.push("licence-to-alter");

  // Custom field scanning
  if (!addOns.includes("management-pack")) {
    const match = customFields.find((f) => mgmtPackPattern.test(`${f.casedetail_slug} ${f.casedetail_value}`.toLowerCase()));
    if (match) addOns.push("management-pack");
  }
  if (!addOns.includes("licence-to-alter")) {
    const match = customFields.find((f) => licenceToAlterPattern.test(`${f.casedetail_slug} ${f.casedetail_value}`.toLowerCase()));
    if (match) addOns.push("licence-to-alter");
  }

  return addOns;
}

// ── LICENCE TO ALTER: TRUE POSITIVES ──

Deno.test("Licence to Alter: doc name 'Licence to Alter.pdf' triggers detection", () => {
  const addOns = detectAddOns([], ["licence to alter.pdf"]);
  assertEquals(addOns.includes("licence-to-alter"), true);
});

Deno.test("Licence to Alter: doc name 'License to Alter' (US spelling) triggers detection", () => {
  const addOns = detectAddOns([], ["license to alter - flat 4.pdf"]);
  assertEquals(addOns.includes("licence-to-alter"), true);
});

Deno.test("Licence to Alter: doc name 'Licence for Alteration' triggers detection", () => {
  const addOns = detectAddOns([], ["licence for alteration 2024.pdf"]);
  assertEquals(addOns.includes("licence-to-alter"), true);
});

Deno.test("Licence to Alter: custom field slug triggers detection", () => {
  const addOns = detectAddOns([
    { casedetail_slug: "licence-to-alter-required", casedetail_value: "yes" },
  ]);
  assertEquals(addOns.includes("licence-to-alter"), true);
});

Deno.test("Licence to Alter: custom field value triggers detection", () => {
  const addOns = detectAddOns([
    { casedetail_slug: "additional-docs", casedetail_value: "Licence to Alter needed" },
  ]);
  assertEquals(addOns.includes("licence-to-alter"), true);
});

Deno.test("Licence to Alter: 'alteration licence' variant triggers detection", () => {
  const addOns = detectAddOns([], ["alteration licence granted.pdf"]);
  assertEquals(addOns.includes("licence-to-alter"), true);
});

// ── LICENCE TO ALTER: FALSE POSITIVES ──

Deno.test("Licence to Alter: unrelated 'licence' doc should NOT trigger", () => {
  const addOns = detectAddOns([], ["licence agreement.pdf", "building licence.pdf"]);
  assertEquals(addOns.includes("licence-to-alter"), false);
});

// ── MANAGEMENT PACK: TRUE POSITIVES ──

Deno.test("Management Pack: doc name 'LPE1' triggers detection", () => {
  const addOns = detectAddOns([], ["lpe1 form.pdf"]);
  assertEquals(addOns.includes("management-pack"), true);
});

Deno.test("Management Pack: doc name 'Service Charge Pack' triggers detection", () => {
  const addOns = detectAddOns([], ["service charge pack 2025.pdf"]);
  assertEquals(addOns.includes("management-pack"), true);
});

Deno.test("Management Pack: custom field with 'leasehold property enquiries' triggers detection", () => {
  const addOns = detectAddOns([
    { casedetail_slug: "leasehold-property-enquiries-received", casedetail_value: "pending" },
  ]);
  assertEquals(addOns.includes("management-pack"), true);
});

// ── BOTH ADD-ONS ──

Deno.test("Both add-ons: management pack from docs, licence to alter from custom fields", () => {
  const addOns = detectAddOns(
    [{ casedetail_slug: "licence-to-alter-status", casedetail_value: "approved" }],
    ["management pack.pdf"]
  );
  assertEquals(addOns.includes("management-pack"), true);
  assertEquals(addOns.includes("licence-to-alter"), true);
  assertEquals(addOns.length, 2);
});

Deno.test("No add-ons: unrelated docs and fields", () => {
  const addOns = detectAddOns(
    [{ casedetail_slug: "fo-registered-with-title-absolute", casedetail_value: "" }],
    ["contract.pdf", "title plan.pdf"]
  );
  assertEquals(addOns, []);
});
