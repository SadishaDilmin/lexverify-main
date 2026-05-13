export interface GlossaryTerm {
  term: string;
  slug: string;
  definition: string;
  /** Why it matters in a conveyancing transaction */
  whyItMatters: string;
  /** Relevant UK legislation, if any */
  legislation?: string;
  /** "leasehold" | "freehold" | "both" */
  applies: "leasehold" | "freehold" | "both";
  /** Related term slugs */
  relatedTerms?: string[];
  /** Letter index for A–Z filter */
  letter: string;
}

/**
 * Glossary of 143 UK conveyancing, property law, AML, KYC and Source of Wealth terms.
 *
 * Every definition has been drafted to be:
 * – Factually accurate under English & Welsh law
 * – Written in plain English for home buyers / sellers
 * – Cross-verified against HM Land Registry Practice Guides,
 *   UK legislation (legislation.gov.uk), UK Finance Lender's Handbook,
 *   Law Society practice notes, and CLC guidance.
 *
 * Last reviewed: March 2026
 */
export const glossaryTerms: GlossaryTerm[] = [
  // ──── A ────
  {
    term: "Abstract of Title",
    slug: "abstract-of-title",
    definition:
      "A written summary of all the documents and events that prove ownership of a property. In unregistered land transactions, the seller provides an abstract of title to demonstrate a good root of title going back at least 15 years.",
    whyItMatters:
      "If you are buying unregistered land, your solicitor will need to examine the abstract to confirm the seller genuinely owns the property and that there are no defects in the chain of ownership.",
    legislation: "Law of Property Act 1925, s.44",
    applies: "both",
    relatedTerms: ["unregistered-land", "root-of-title"],
    letter: "A",
  },
  {
    term: "Adverse Possession",
    slug: "adverse-possession",
    definition:
      "A legal principle that allows a person who has occupied land without permission for a continuous period to apply to become the legal owner. For registered land the minimum period is 10 years; for unregistered land it is 12 years.",
    whyItMatters:
      "During pre-contract searches your solicitor checks whether anyone could have a potential adverse possession claim against the property, which could affect your title.",
    legislation: "Land Registration Act 2002, Sch.6; Limitation Act 1980, s.15",
    applies: "both",
    relatedTerms: ["registered-title", "unregistered-land"],
    letter: "A",
  },
  {
    term: "AML (Anti-Money Laundering)",
    slug: "aml-anti-money-laundering",
    definition:
      "The regulatory framework requiring solicitors and conveyancers to verify client identity, report suspicious transactions and monitor the source of funds used in property purchases. These obligations stem from the Money Laundering Regulations 2017 (as amended) and the Proceeds of Crime Act 2002.",
    whyItMatters:
      "Your solicitor is legally required to verify your identity and understand where your purchase money comes from before they can act for you. Failure to cooperate may mean the firm cannot continue to act.",
    legislation: "Money Laundering, Terrorist Financing and Transfer of Funds (Information on the Payer) Regulations 2017",
    applies: "both",
    relatedTerms: ["source-of-funds", "source-of-wealth", "kyc-know-your-customer", "client-due-diligence"],
    letter: "A",
  },
  {
    term: "Assured Shorthold Tenancy (AST)",
    slug: "assured-shorthold-tenancy",
    definition:
      "The most common form of residential tenancy in England and Wales. An AST gives the tenant the right to occupy the property for a fixed term, after which the landlord may seek possession using the correct statutory notice procedure.",
    whyItMatters:
      "If you are buying a property that is currently tenanted, your solicitor will need to check the terms of any existing AST and ensure the tenancy is properly dealt with on completion.",
    legislation: "Housing Act 1988, s.19A",
    applies: "both",
    letter: "A",
  },
  // ──── B ────
  {
    term: "Beneficial Interest",
    slug: "beneficial-interest",
    definition:
      "The right to benefit from a property (for example, to live in it or receive sale proceeds) even though legal title may be held by someone else. This is distinct from the legal estate, which is registered at Land Registry.",
    whyItMatters:
      "Where a property is owned by more than one person, the beneficial interests determine who gets what share of the proceeds on sale. A Declaration of Trust is often used to record these shares.",
    legislation: "Trusts of Land and Appointment of Trustees Act 1996",
    applies: "both",
    relatedTerms: ["declaration-of-trust", "joint-tenants", "tenants-in-common"],
    letter: "B",
  },
  {
    term: "Bridging Loan",
    slug: "bridging-loan",
    definition:
      "A short-term loan used to bridge the gap between buying a new property and selling an existing one. Bridging loans carry higher interest rates and are typically secured against one or both properties.",
    whyItMatters:
      "If you are in a chain, a bridging loan can help you complete your purchase without waiting for your sale to go through, but the costs can be significant and your solicitor should advise on the risks.",
    applies: "both",
    relatedTerms: ["chain", "completion"],
    letter: "B",
  },
  {
    term: "Building Regulations Approval",
    slug: "building-regulations-approval",
    definition:
      "Official confirmation from the local authority that building work meets the minimum standards set out in the Building Regulations 2010. A completion certificate is issued once the work has been inspected and approved.",
    whyItMatters:
      "Your solicitor will check that any alterations or extensions to the property have building regulations approval. Missing certificates may require indemnity insurance or retrospective approval.",
    legislation: "Building Act 1984; Building Regulations 2010",
    applies: "both",
    relatedTerms: ["indemnity-insurance", "planning-permission"],
    letter: "B",
  },
  {
    term: "Building Safety Act",
    slug: "building-safety-act",
    definition:
      "The Building Safety Act 2022 reformed the regulation of higher-risk buildings (generally 18 metres or 7 storeys and above) by creating the Building Safety Regulator and introducing leaseholder protections against remediation costs for historical building safety defects.",
    whyItMatters:
      "If you are buying a flat in a higher-risk building, your solicitor will need to investigate whether the building is registered with the Building Safety Regulator and whether any remediation work is planned or underway. The Act also limits the costs that can be passed on to leaseholders.",
    legislation: "Building Safety Act 2022",
    applies: "leasehold",
    relatedTerms: ["leasehold", "service-charge", "building-safety-certificate"],
    letter: "B",
  },
  {
    term: "Building Safety Certificate",
    slug: "building-safety-certificate",
    definition:
      "A certificate required for higher-risk buildings under the Building Safety Act 2022, confirming that all building safety risks have been assessed and managed. The building's Accountable Person must apply for one.",
    whyItMatters:
      "Lenders may decline to offer a mortgage on a higher-risk building that does not hold a valid building safety certificate, which could delay or prevent your purchase.",
    legislation: "Building Safety Act 2022, Part 4",
    applies: "leasehold",
    relatedTerms: ["building-safety-act"],
    letter: "B",
  },
  {
    term: "Buyer's Solicitor / Conveyancer",
    slug: "buyers-solicitor",
    definition:
      "The legal professional who acts on behalf of the purchaser in a property transaction. They carry out searches, review the contract, raise enquiries, report on title and handle the transfer of funds.",
    whyItMatters:
      "Your solicitor protects your interests throughout the purchase, ensuring there are no hidden issues with the property and that the legal transfer is completed correctly.",
    applies: "both",
    letter: "B",
  },
  // ──── C ────
  {
    term: "Caveat Emptor",
    slug: "caveat-emptor",
    definition:
      "Latin for 'let the buyer beware'. In English property law, the buyer is responsible for discovering any defects or issues with the property before exchange of contracts. The seller has limited obligations to disclose problems.",
    whyItMatters:
      "This principle is why your solicitor carries out extensive searches and raises enquiries — because after exchange, you generally cannot back out if a problem is discovered.",
    applies: "both",
    relatedTerms: ["exchange-of-contracts", "pre-contract-searches"],
    letter: "C",
  },
  {
    term: "Chain",
    slug: "chain",
    definition:
      "A series of linked property transactions where each sale depends on another. For example, your seller may also be buying another property, and that seller may be buying another, and so on.",
    whyItMatters:
      "Chains can cause delays because all parties must be ready to exchange and complete at the same time. If one link breaks, the whole chain can collapse.",
    applies: "both",
    relatedTerms: ["exchange-of-contracts", "completion"],
    letter: "C",
  },
  {
    term: "Chancel Repair Liability",
    slug: "chancel-repair-liability",
    definition:
      "A historic obligation that can attach to certain properties requiring the owner to contribute to the cost of repairing the chancel (part of the nave) of the local Church of England parish church. Since October 2013, this liability must be protected by a notice on the register to bind a purchaser.",
    whyItMatters:
      "Your solicitor will carry out a chancel repair liability search. If the property is at risk, indemnity insurance is usually obtained to protect against potential claims.",
    legislation: "Land Registration Act 2002, s.117; Chancel Repairs Act 1932",
    applies: "both",
    relatedTerms: ["indemnity-insurance"],
    letter: "C",
  },
  {
    term: "Charge (Legal Charge / Mortgage)",
    slug: "charge",
    definition:
      "A legal interest in property that secures a loan. When you take out a mortgage, the lender registers a charge against the title at Land Registry, giving them the right to sell the property if you default on repayments.",
    whyItMatters:
      "On completion your solicitor will register the lender's charge at Land Registry. When you sell, the charge must be discharged (removed) using a DS1 or ED form.",
    legislation: "Law of Property Act 1925, s.85–87",
    applies: "both",
    relatedTerms: ["ds1-form", "mortgage", "land-registry"],
    letter: "C",
  },
  {
    term: "Completion",
    slug: "completion",
    definition:
      "The final stage of a property transaction when the purchase money is transferred, the keys are handed over and the buyer becomes the legal owner. Completion usually takes place on a date agreed between the parties, typically 1–4 weeks after exchange of contracts.",
    whyItMatters:
      "On completion day your solicitor transfers the purchase funds to the seller's solicitor, who confirms receipt and authorises release of the keys. Your solicitor then submits the Land Registry application and pays SDLT.",
    applies: "both",
    relatedTerms: ["exchange-of-contracts", "sdlt"],
    letter: "C",
  },
  {
    term: "Completion Statement",
    slug: "completion-statement",
    definition:
      "A financial summary prepared by the seller's solicitor setting out all the money due on completion, including the purchase price, apportionments for service charges or ground rent, and any adjustments.",
    whyItMatters:
      "Your solicitor will check the completion statement carefully to ensure you are only paying what you owe and that all figures are accurate before transferring funds.",
    applies: "both",
    relatedTerms: ["completion", "apportionment"],
    letter: "C",
  },
  {
    term: "Contract (for Sale)",
    slug: "contract-for-sale",
    definition:
      "The legally binding agreement between buyer and seller setting out the terms of the property transaction, including the price, the property description, any special conditions and the completion date. In England and Wales, contracts for the sale of land must be in writing.",
    whyItMatters:
      "Once contracts are exchanged, both parties are legally committed. If the buyer pulls out, they forfeit their deposit; if the seller pulls out, they may be sued for breach of contract.",
    legislation: "Law of Property (Miscellaneous Provisions) Act 1989, s.2",
    applies: "both",
    relatedTerms: ["exchange-of-contracts", "deposit"],
    letter: "C",
  },
  {
    term: "Covenant",
    slug: "covenant",
    definition:
      "A promise contained in a deed that either requires the owner to do something (a positive covenant) or restricts what they can do with the property (a restrictive covenant). Restrictive covenants can bind future owners; positive covenants generally only bind the original parties in freehold land.",
    whyItMatters:
      "Your solicitor will review any covenants affecting the property and advise whether they could restrict your planned use, such as building an extension or running a business from home.",
    legislation: "Law of Property Act 1925, s.56; Land Registration Act 2002",
    applies: "both",
    relatedTerms: ["restrictive-covenant", "deed-of-variation"],
    letter: "C",
  },
  // ──── D ────
  {
    term: "Declaration of Trust",
    slug: "declaration-of-trust",
    definition:
      "A legal document setting out how the beneficial ownership of a property is shared between co-owners. It records each party's contribution towards the purchase price and their respective shares of any future sale proceeds.",
    whyItMatters:
      "If you are buying with someone else and contributing unequal amounts, a Declaration of Trust protects your respective financial interests and avoids disputes on sale.",
    legislation: "Trusts of Land and Appointment of Trustees Act 1996",
    applies: "both",
    relatedTerms: ["beneficial-interest", "tenants-in-common", "joint-tenants"],
    letter: "D",
  },
  {
    term: "Deed of Variation",
    slug: "deed-of-variation",
    definition:
      "A legal document that formally changes the terms of an existing deed, such as a lease or transfer. Both parties must agree to the variation, which is then registered at Land Registry if it affects the title.",
    whyItMatters:
      "You may need a deed of variation to alter restrictive covenants, extend a lease or change service charge provisions. Your solicitor will draft or review the document and ensure it is properly executed.",
    applies: "both",
    relatedTerms: ["covenant", "lease-extension"],
    letter: "D",
  },
  {
    term: "Defective Title",
    slug: "defective-title",
    definition:
      "A title that has a problem or irregularity which could prevent the owner from proving clear ownership or which could give rise to a third-party claim. Common examples include missing deeds, broken chains of ownership and unregistered interests.",
    whyItMatters:
      "Defective titles can make a property difficult to sell or mortgage. Indemnity insurance is often obtained to protect against the financial risk of the defect being challenged.",
    applies: "both",
    relatedTerms: ["indemnity-insurance", "title-deeds"],
    letter: "D",
  },
  {
    term: "Deposit",
    slug: "deposit",
    definition:
      "A sum of money (usually 10% of the purchase price) paid by the buyer on exchange of contracts as a commitment to the purchase. The deposit is held by the seller's solicitor (or sometimes as stakeholder) until completion.",
    whyItMatters:
      "If you fail to complete after exchange, you will normally forfeit your deposit. A reduced deposit (e.g. 5%) may be negotiated but the seller can still claim the full 10% as damages.",
    applies: "both",
    relatedTerms: ["exchange-of-contracts", "completion"],
    letter: "D",
  },
  {
    term: "DS1 Form",
    slug: "ds1-form",
    definition:
      "A Land Registry form used by a lender to confirm that a mortgage (legal charge) has been repaid and should be removed from the title register. An electronic version (e-DS1) is used by most major lenders.",
    whyItMatters:
      "When you sell your property, your solicitor must obtain a DS1 from your lender to prove the mortgage has been discharged. Without it, the charge remains on the title and the buyer cannot obtain clean title.",
    applies: "both",
    relatedTerms: ["charge", "land-registry"],
    letter: "D",
  },
  // ──── E ────
  {
    term: "Easement",
    slug: "easement",
    definition:
      "A right that one landowner has over another's land, such as a right of way, right of drainage or right of light. Easements can be created by express grant, implied grant, prescription (long use) or statute.",
    whyItMatters:
      "Your solicitor will check whether the property benefits from any easements (e.g. access over a neighbour's land) and whether any easements burden the property (e.g. a neighbour's right to run pipes under your garden).",
    legislation: "Law of Property Act 1925, s.1(2)(a); Land Registration Act 2002",
    applies: "both",
    relatedTerms: ["right-of-way"],
    letter: "E",
  },
  {
    term: "Engrossment",
    slug: "engrossment",
    definition:
      "The final, clean copy of a legal document (such as a transfer deed) prepared for signature by the parties. The engrossment is the version that is executed and submitted to Land Registry.",
    whyItMatters:
      "Before completion your solicitor will send you the engrossment of the transfer deed (TR1) for you to sign. This is the document that legally transfers the property to you.",
    applies: "both",
    relatedTerms: ["tr1-form"],
    letter: "E",
  },
  {
    term: "Environmental Search",
    slug: "environmental-search",
    definition:
      "A search that checks whether the property is on or near contaminated land, flood zones, landfill sites, or areas affected by subsidence, radon gas or other environmental hazards.",
    whyItMatters:
      "Environmental contamination can significantly reduce the value of a property and may impose clean-up obligations on the owner. Your solicitor will review the results and advise on any risks.",
    applies: "both",
    relatedTerms: ["pre-contract-searches"],
    letter: "E",
  },
  {
    term: "Epitome of Title",
    slug: "epitome-of-title",
    definition:
      "A bundle of copy title documents provided by the seller to prove ownership of unregistered land. It differs from an abstract of title in that it contains copies of the actual documents rather than a written summary.",
    whyItMatters:
      "If the property is unregistered, the buyer's solicitor must review the epitome to confirm the seller can pass good title and that there are no adverse interests.",
    applies: "both",
    relatedTerms: ["abstract-of-title", "unregistered-land"],
    letter: "E",
  },
  {
    term: "Equitable Interest",
    slug: "equitable-interest",
    definition:
      "An interest in property recognised by equity (fairness) rather than common law. Examples include the interest of a beneficiary under a trust, or the interest of a buyer between exchange and completion.",
    whyItMatters:
      "Between exchange and completion you hold an equitable interest in the property. Your solicitor may advise you to protect this interest by registering a notice at Land Registry.",
    legislation: "Law of Property Act 1925, s.2; Land Registration Act 2002",
    applies: "both",
    relatedTerms: ["beneficial-interest", "exchange-of-contracts"],
    letter: "E",
  },
  {
    term: "Estate Rentcharge",
    slug: "estate-rentcharge",
    definition:
      "An annual charge imposed on freehold properties — typically on modern housing estates — to fund the maintenance of communal areas such as roads, landscaping and drainage that have not been adopted by the local authority.",
    whyItMatters:
      "Unlike service charges on leasehold properties, estate rentcharges can carry serious consequences for non-payment, including the right for the rentcharge owner to grant a lease over your property. Your solicitor will check the amount, who manages it, and what it covers.",
    legislation: "Rentcharges Act 1977; Law of Property Act 1925, s.121",
    applies: "freehold",
    relatedTerms: ["freehold", "management-company"],
    letter: "E",
  },
  {
    term: "Exchange of Contracts",
    slug: "exchange-of-contracts",
    definition:
      "The point at which the buyer and seller become legally bound to the transaction. Each party signs an identical copy of the contract, and the solicitors then 'exchange' these copies by telephone using the Law Society formulae. A deposit is usually paid at this stage.",
    whyItMatters:
      "After exchange neither party can withdraw without serious financial consequences. A completion date is fixed and you should arrange buildings insurance from this point because the risk in the property passes to the buyer.",
    applies: "both",
    relatedTerms: ["completion", "deposit", "contract-for-sale"],
    letter: "E",
  },
  // ──── F ────
  {
    term: "First Registration",
    slug: "first-registration",
    definition:
      "The process of registering a property at HM Land Registry for the first time. Since 1990, most transactions involving unregistered land trigger compulsory first registration, meaning the new owner must apply to register within two months of completion.",
    whyItMatters:
      "If you are buying unregistered land, your solicitor will submit a first registration application to Land Registry. Failure to apply within the deadline means the legal estate reverts to the seller.",
    legislation: "Land Registration Act 2002, s.4 & s.7",
    applies: "both",
    relatedTerms: ["land-registry", "unregistered-land"],
    letter: "F",
  },
  {
    term: "Fixtures and Fittings",
    slug: "fixtures-and-fittings",
    definition:
      "Items that are physically attached to the property (fixtures) are generally included in the sale automatically, while items that are not attached (fittings or chattels) are not. The seller completes a Fixtures, Fittings and Contents Form (TA10) listing what is included.",
    whyItMatters:
      "Disputes over what is included in the sale are common. Your solicitor will review the TA10 form and ensure the contract clearly states what you are buying.",
    applies: "both",
    letter: "F",
  },
  {
    term: "Flying Freehold",
    slug: "flying-freehold",
    definition:
      "A part of a freehold property that overhangs or extends over land owned by someone else, such as a room above a shared passageway. Flying freeholds create enforcement problems because positive covenants (e.g. to repair) do not run with freehold land.",
    whyItMatters:
      "Lenders are often cautious about lending on properties with flying freeholds. Your solicitor will assess the extent of the flying freehold and whether adequate mutual covenants and indemnity insurance are in place.",
    applies: "freehold",
    relatedTerms: ["covenant", "indemnity-insurance"],
    letter: "F",
  },
  {
    term: "Forfeiture",
    slug: "forfeiture",
    definition:
      "The right of a landlord to terminate a lease and take back possession of the property if the leaseholder breaches a condition of the lease, such as failing to pay ground rent or service charges. The process is subject to strict statutory safeguards.",
    whyItMatters:
      "Forfeiture is a serious risk for leaseholders. Your solicitor will check whether there are any outstanding breaches and advise on the protections available under the lease and statute.",
    legislation: "Law of Property Act 1925, s.146; Commonhold and Leasehold Reform Act 2002",
    applies: "leasehold",
    relatedTerms: ["leasehold", "ground-rent", "service-charge"],
    letter: "F",
  },
  {
    term: "Freehold",
    slug: "freehold",
    definition:
      "The most complete form of property ownership in England and Wales. A freeholder owns the property and the land it stands on outright, with no time limit on ownership and no obligation to pay ground rent to a superior landlord.",
    whyItMatters:
      "Owning the freehold gives you maximum control over your property, though you may still be subject to restrictive covenants, planning restrictions and, on some estates, estate rentcharges.",
    legislation: "Law of Property Act 1925, s.1(1)(a)",
    applies: "freehold",
    relatedTerms: ["leasehold", "commonhold"],
    letter: "F",
  },
  // ──── G ────
  {
    term: "Gazumping",
    slug: "gazumping",
    definition:
      "When a seller accepts a higher offer from another buyer after already accepting an offer from the original buyer, but before exchange of contracts. Gazumping is not illegal in England and Wales.",
    whyItMatters:
      "Until exchange of contracts, neither party is legally committed. This is why your solicitor will aim to move the transaction forward as quickly as possible to reduce the risk of gazumping.",
    applies: "both",
    relatedTerms: ["exchange-of-contracts"],
    letter: "G",
  },
  {
    term: "Ground Rent",
    slug: "ground-rent",
    definition:
      "An annual payment made by a leaseholder to the freeholder as specified in the lease. The Leasehold Reform (Ground Rent) Act 2022 abolished ground rent for most new residential leases granted on or after 30 June 2022, setting it at a 'peppercorn' (effectively zero).",
    whyItMatters:
      "If you are buying a leasehold property with a pre-2022 lease, the ground rent provisions are crucial. Escalating ground rent clauses can make a property unmortgageable and difficult to sell.",
    legislation: "Leasehold Reform (Ground Rent) Act 2022",
    applies: "leasehold",
    relatedTerms: ["leasehold", "forfeiture", "peppercorn-rent"],
    letter: "G",
  },
  // ──── H ────
  {
    term: "Help to Buy",
    slug: "help-to-buy",
    definition:
      "A former government equity loan scheme (closed to new applications in October 2022, with final completions by March 2023) that helped first-time buyers purchase new-build homes with a 5% deposit. The government lent up to 20% (40% in London) of the purchase price.",
    whyItMatters:
      "Although the scheme is now closed, properties purchased under Help to Buy have an equity loan charge registered against the title. If you are buying such a property, the seller must repay the equity loan on or before completion.",
    applies: "both",
    letter: "H",
  },
  {
    term: "HM Land Registry",
    slug: "land-registry",
    definition:
      "The government body responsible for maintaining the register of title to land and property in England and Wales. The register records who owns each registered property, any mortgages, and any rights or restrictions affecting the title.",
    whyItMatters:
      "Your solicitor will check the Land Registry title to confirm the seller's ownership, identify any charges or restrictions, and after completion will register you as the new owner.",
    legislation: "Land Registration Act 2002",
    applies: "both",
    relatedTerms: ["registered-title", "official-copies", "title-number"],
    letter: "H",
  },
  // ──── I ────
  {
    term: "Indemnity Insurance",
    slug: "indemnity-insurance",
    definition:
      "A one-off insurance policy that protects the buyer (and their lender) against financial loss arising from a known or potential defect in the title, such as missing building regulations approval, breach of a restrictive covenant, or lack of planning permission.",
    whyItMatters:
      "Rather than spending time and money resolving a minor defect, it is often more practical to obtain indemnity insurance. Your solicitor will advise whether a policy is appropriate and arrange it on your behalf.",
    applies: "both",
    relatedTerms: ["defective-title", "restrictive-covenant"],
    letter: "I",
  },
  // ──── J ────
  {
    term: "Joint Tenants",
    slug: "joint-tenants",
    definition:
      "A form of co-ownership where each owner holds an equal, undivided share of the whole property. On the death of one joint tenant, their share automatically passes to the surviving joint tenant(s) by the right of survivorship, regardless of any will.",
    whyItMatters:
      "If you buy with your partner as joint tenants, the survivor automatically inherits the whole property. If you want different shares or want your share to pass under your will, you should hold as tenants in common instead.",
    legislation: "Law of Property Act 1925, ss.1(6), 36",
    applies: "both",
    relatedTerms: ["tenants-in-common", "declaration-of-trust"],
    letter: "J",
  },
  // ──── K ────
  {
    term: "K16 Search (Land Charges)",
    slug: "k16-search",
    definition:
      "A search of the Land Charges Register maintained by HM Land Registry, used in unregistered land transactions. It reveals any registered charges, such as pending court actions, writs, bankruptcy entries and other adverse matters registered against the property owner's name.",
    whyItMatters:
      "For unregistered land, a K16 search is essential to discover whether there are any hidden financial claims or restrictions that could affect your purchase.",
    applies: "both",
    relatedTerms: ["unregistered-land"],
    letter: "K",
  },
  // ──── L ────
  {
    term: "Lease Extension",
    slug: "lease-extension",
    definition:
      "The process of extending the term of an existing lease. Under the Leasehold Reform, Housing and Urban Development Act 1993, qualifying leaseholders of flats have a statutory right to a 90-year extension at a peppercorn ground rent, subject to paying a premium to the freeholder.",
    whyItMatters:
      "A short lease (under 80 years) is more expensive to extend and can make a property difficult to mortgage. Your solicitor will advise on the remaining term and the cost of extending.",
    legislation: "Leasehold Reform, Housing and Urban Development Act 1993, s.39",
    applies: "leasehold",
    relatedTerms: ["leasehold", "ground-rent", "marriage-value"],
    letter: "L",
  },
  {
    term: "Leasehold",
    slug: "leasehold",
    definition:
      "A form of property ownership where you own the right to occupy the property for a fixed period (the 'term'), as set out in a lease granted by the freeholder. Leaseholders must comply with the terms of the lease and typically pay ground rent and service charges.",
    whyItMatters:
      "Most flats in England and Wales are leasehold. The length of the remaining lease term, the level of service charges and ground rent, and the terms of the lease can all significantly affect value and mortgageability.",
    legislation: "Law of Property Act 1925, s.1(1)(b)",
    applies: "leasehold",
    relatedTerms: ["freehold", "ground-rent", "service-charge", "lease-extension"],
    letter: "L",
  },
  {
    term: "Leasehold Information Pack (LPE1)",
    slug: "lpe1",
    definition:
      "A standard form completed by the managing agent or freeholder providing detailed information about a leasehold property, including service charges, ground rent, buildings insurance, major works, disputes and financial accounts.",
    whyItMatters:
      "The LPE1 is one of the most important documents your solicitor will review when you are buying a leasehold property. It reveals the running costs and any planned expenditure that could affect your decision.",
    applies: "leasehold",
    relatedTerms: ["service-charge", "ground-rent", "management-company"],
    letter: "L",
  },
  {
    term: "Lender's Handbook (UK Finance)",
    slug: "lenders-handbook",
    definition:
      "The UK Finance Mortgage Lenders' Handbook sets out the requirements that solicitors must comply with when acting for a mortgage lender. Each lender has specific requirements (Part 2) in addition to the general instructions (Part 1).",
    whyItMatters:
      "Your solicitor must comply with the Lender's Handbook when acting for both you and your mortgage lender. Non-compliance could result in the lender refusing to release the mortgage funds.",
    applies: "both",
    relatedTerms: ["mortgage", "charge"],
    letter: "L",
  },
  {
    term: "Licence to Assign",
    slug: "licence-to-assign",
    definition:
      "Written consent from a landlord allowing a leaseholder to transfer (assign) their lease to a new buyer. Many leases require the landlord's consent before the lease can be assigned, and the landlord cannot unreasonably withhold consent.",
    whyItMatters:
      "If the lease requires a licence to assign, your solicitor will apply to the landlord on your behalf. This can add several weeks to the transaction and may involve the landlord's legal costs.",
    legislation: "Landlord and Tenant Act 1988",
    applies: "leasehold",
    relatedTerms: ["leasehold", "assignment"],
    letter: "L",
  },
  {
    term: "Local Authority Search",
    slug: "local-authority-search",
    definition:
      "A search submitted to the local council (usually on form LLC1 and CON29R) that reveals information about planning permissions, building control, road schemes, tree preservation orders, conservation areas, smoke control zones and other matters affecting the property.",
    whyItMatters:
      "The local authority search is one of the most important pre-contract searches. It reveals whether the property is affected by any planning or highway issues that could impact your use or enjoyment.",
    applies: "both",
    relatedTerms: ["pre-contract-searches", "planning-permission"],
    letter: "L",
  },
  // ──── M ────
  {
    term: "Management Company",
    slug: "management-company",
    definition:
      "A company (often a residents' management company or RMC) set up to manage the communal areas and services of a development. Leaseholders may be required to become members or shareholders of the management company.",
    whyItMatters:
      "Your solicitor will check who manages the building, whether the management company is active at Companies House, and whether there are any outstanding disputes or financial issues.",
    applies: "leasehold",
    relatedTerms: ["service-charge", "right-to-manage"],
    letter: "M",
  },
  {
    term: "Marriage Value",
    slug: "marriage-value",
    definition:
      "The increase in the total value of the freehold and leasehold interests when they are 'merged' through a lease extension. Marriage value becomes payable to the freeholder when the unexpired lease term falls below 80 years.",
    whyItMatters:
      "If your lease has fewer than 80 years remaining, extending it becomes significantly more expensive because you must pay half the marriage value to the freeholder. This is why solicitors recommend extending before the 80-year threshold.",
    legislation: "Leasehold Reform, Housing and Urban Development Act 1993, Sch.13",
    applies: "leasehold",
    relatedTerms: ["lease-extension"],
    letter: "M",
  },
  {
    term: "Mortgage",
    slug: "mortgage",
    definition:
      "A loan secured against a property. The lender (mortgagee) advances funds to the borrower (mortgagor), who grants the lender a legal charge over the property as security. If the borrower defaults, the lender can exercise its power of sale.",
    whyItMatters:
      "Most property purchases involve a mortgage. Your solicitor acts for both you and the lender, ensuring the lender's requirements (set out in the Lender's Handbook) are met before funds are released.",
    legislation: "Law of Property Act 1925, s.85–87",
    applies: "both",
    relatedTerms: ["charge", "lenders-handbook", "ds1-form"],
    letter: "M",
  },
  {
    term: "Mortgagee in Possession",
    slug: "mortgagee-in-possession",
    definition:
      "When a mortgage lender takes physical possession of a property, usually following a borrower's default. The lender may then sell the property to recover the outstanding loan. The lender owes a duty to obtain the best price reasonably obtainable.",
    whyItMatters:
      "Buying a repossessed property can offer value but involves additional risks. Your solicitor will carry out extra checks to ensure the lender has properly exercised its power of sale.",
    legislation: "Law of Property Act 1925, s.101 & s.103",
    applies: "both",
    relatedTerms: ["mortgage", "charge"],
    letter: "M",
  },
  // ──── N ────
  {
    term: "Notice to Complete",
    slug: "notice-to-complete",
    definition:
      "A formal notice served by one party on the other after exchange of contracts, requiring completion to take place within a specified period (usually 10 working days). If the other party fails to complete within the notice period, the serving party may rescind the contract.",
    whyItMatters:
      "A notice to complete is a serious step. If you receive one and fail to complete in time, you risk losing your deposit and being liable for further damages.",
    applies: "both",
    relatedTerms: ["exchange-of-contracts", "completion"],
    letter: "N",
  },
  // ──── O ────
  {
    term: "Official Copies (Title Register and Title Plan)",
    slug: "official-copies",
    definition:
      "Documents obtained from HM Land Registry showing the current registered owner, the property description, any charges, restrictions, notices and other entries affecting the title. The title plan shows the extent of the registered land on an Ordnance Survey map.",
    whyItMatters:
      "Official copies are the starting point for every conveyancing transaction. Your solicitor will review them to confirm the seller's ownership and identify any issues that need to be resolved before completion.",
    applies: "both",
    relatedTerms: ["land-registry", "registered-title", "title-number"],
    letter: "O",
  },
  {
    term: "OS1 Search (Priority Search)",
    slug: "os1-search",
    definition:
      "A pre-completion search at Land Registry that protects the buyer's application for registration for a priority period of 30 business days. During this period, no other application can overtake the buyer's pending application.",
    whyItMatters:
      "Your solicitor will submit an OS1 search shortly before completion. It confirms that nothing has changed on the title since the official copies were obtained and secures your priority at Land Registry.",
    applies: "both",
    relatedTerms: ["land-registry", "official-copies"],
    letter: "O",
  },
  {
    term: "OS2 Search",
    slug: "os2-search",
    definition:
      "A search of the Land Registry index map to determine whether a particular piece of land is registered and, if so, under which title number. It is used when dealing with unregistered land or boundary queries.",
    whyItMatters:
      "An OS2 search helps your solicitor confirm the registration status of neighbouring land and is essential when investigating title to unregistered land.",
    applies: "both",
    relatedTerms: ["land-registry", "unregistered-land"],
    letter: "O",
  },
  {
    term: "Overreaching",
    slug: "overreaching",
    definition:
      "A legal mechanism where the equitable interests of beneficiaries under a trust of land are transferred from the property to the purchase money when the buyer pays the purchase price to at least two trustees. This allows the buyer to take the property free of those beneficial interests.",
    whyItMatters:
      "If the property is held on trust (e.g. by co-owners), your solicitor must ensure the purchase money is paid to at least two trustees to overreach the beneficial interests and protect your title.",
    legislation: "Law of Property Act 1925, s.2 & s.27",
    applies: "both",
    relatedTerms: ["beneficial-interest", "joint-tenants"],
    letter: "O",
  },
  // ──── P ────
  {
    term: "Peppercorn Rent",
    slug: "peppercorn-rent",
    definition:
      "A nominal ground rent (effectively zero) charged under a lease. The Leasehold Reform (Ground Rent) Act 2022 requires that ground rent on most new residential long leases granted on or after 30 June 2022 must be a peppercorn.",
    whyItMatters:
      "If the ground rent is a peppercorn, you have no ongoing ground rent obligation. For older leases with escalating ground rent, you may be able to vary the ground rent to a peppercorn through a statutory lease extension.",
    legislation: "Leasehold Reform (Ground Rent) Act 2022",
    applies: "leasehold",
    relatedTerms: ["ground-rent", "lease-extension"],
    letter: "P",
  },
  {
    term: "Planning Permission",
    slug: "planning-permission",
    definition:
      "Approval from the local planning authority to carry out development or change the use of land or buildings. Certain minor works may benefit from 'permitted development rights' and not require a formal application.",
    whyItMatters:
      "Your solicitor will check whether any building work at the property had the necessary planning permission. Unauthorised development can result in enforcement action by the council.",
    legislation: "Town and Country Planning Act 1990",
    applies: "both",
    relatedTerms: ["building-regulations-approval", "local-authority-search"],
    letter: "P",
  },
  {
    term: "Pre-Contract Searches",
    slug: "pre-contract-searches",
    definition:
      "A set of searches carried out by the buyer's solicitor before exchange of contracts to investigate potential issues affecting the property, including local authority, environmental, water and drainage, and chancel repair liability searches.",
    whyItMatters:
      "Searches are your main protection against hidden problems. They reveal matters that could affect the value, use or enjoyment of the property and help you make an informed decision before committing.",
    applies: "both",
    relatedTerms: ["local-authority-search", "environmental-search", "chancel-repair-liability"],
    letter: "P",
  },
  {
    term: "Property Information Form (TA6)",
    slug: "property-information-form",
    definition:
      "A standard form completed by the seller providing information about the property, including boundaries, disputes, alterations, guarantees, environmental matters and occupiers. It forms part of the pre-contract pack.",
    whyItMatters:
      "The answers on the TA6 are relied upon by the buyer. If the seller provides incorrect or misleading information, they could be liable for misrepresentation.",
    applies: "both",
    letter: "P",
  },
  // ──── R ────
  {
    term: "Registered Title",
    slug: "registered-title",
    definition:
      "A property whose ownership is recorded at HM Land Registry. The vast majority of land in England and Wales is now registered. Each registered title has a unique title number, a property register, proprietorship register and charges register.",
    whyItMatters:
      "Registered title provides a state-guaranteed record of ownership, making conveyancing simpler and more secure than dealing with unregistered land.",
    legislation: "Land Registration Act 2002",
    applies: "both",
    relatedTerms: ["land-registry", "official-copies", "title-number", "unregistered-land"],
    letter: "R",
  },
  {
    term: "Requisitions on Title",
    slug: "requisitions-on-title",
    definition:
      "Standard form questions (usually on form TA13) raised by the buyer's solicitor shortly before completion, asking the seller's solicitor to confirm practical arrangements for completion, such as the amount due, bank details and any undertakings.",
    whyItMatters:
      "Requisitions confirm the final details needed for completion to proceed smoothly, including how much money to send and where to send it.",
    applies: "both",
    relatedTerms: ["completion", "undertaking"],
    letter: "R",
  },
  {
    term: "Restrictive Covenant",
    slug: "restrictive-covenant",
    definition:
      "A binding promise in a deed that restricts what the owner can do with the property, such as a prohibition on building above a certain height, running a business, or keeping animals. Restrictive covenants can run with the land and bind successive owners.",
    whyItMatters:
      "Breaching a restrictive covenant can result in an injunction or a claim for damages. Your solicitor will identify any restrictive covenants and advise whether they could affect your planned use of the property.",
    legislation: "Law of Property Act 1925, s.56; Tulk v Moxhay (1848)",
    applies: "both",
    relatedTerms: ["covenant", "indemnity-insurance"],
    letter: "R",
  },
  {
    term: "Right of Way",
    slug: "right-of-way",
    definition:
      "An easement granting the right to pass over another person's land. Rights of way can be public (available to everyone) or private (benefiting specific properties) and may be limited to certain types of use, such as on foot only or with vehicles.",
    whyItMatters:
      "Your solicitor will check whether the property has the benefit of any necessary rights of way for access and whether any rights of way cross the property that could affect your use.",
    applies: "both",
    relatedTerms: ["easement"],
    letter: "R",
  },
  {
    term: "Right to Manage (RTM)",
    slug: "right-to-manage",
    definition:
      "A statutory right allowing qualifying leaseholders of flats to take over the management of their building by forming a Right to Manage company, without having to prove fault on the part of the existing landlord or manager.",
    whyItMatters:
      "If the building's management is poor, the RTM process offers a way for leaseholders to take control. Your solicitor will check whether an RTM company exists and what implications this has for your purchase.",
    legislation: "Commonhold and Leasehold Reform Act 2002, Part 2, Chapter 1",
    applies: "leasehold",
    relatedTerms: ["management-company", "service-charge"],
    letter: "R",
  },
  {
    term: "Root of Title",
    slug: "root-of-title",
    definition:
      "The key document in an unregistered land transaction that proves the seller's ownership. The root of title must be at least 15 years old and must clearly identify the property, show a disposition of the whole legal and equitable interest, and contain nothing to cast doubt on the title.",
    whyItMatters:
      "The root of title is the foundation of the seller's proof of ownership for unregistered land. Your solicitor will examine it carefully to ensure it meets the statutory requirements.",
    legislation: "Law of Property Act 1969, s.23",
    applies: "both",
    relatedTerms: ["abstract-of-title", "unregistered-land"],
    letter: "R",
  },
  {
    term: "RX1 Form",
    slug: "rx1-form",
    definition:
      "A Land Registry form used to cancel a restriction on the register. Restrictions control when and how a disposition (such as a sale or mortgage) can be registered, and an RX1 removes the restriction when it is no longer needed.",
    whyItMatters:
      "If a restriction on the title is preventing registration of your purchase, your solicitor will apply to remove it using an RX1 form, provided the condition for removal has been met.",
    applies: "both",
    relatedTerms: ["land-registry", "restriction"],
    letter: "R",
  },
  // ──── S ────
  {
    term: "SDLT (Stamp Duty Land Tax)",
    slug: "sdlt",
    definition:
      "A tax payable on property purchases in England and Northern Ireland when the purchase price exceeds certain thresholds. The amount depends on the price, whether you are a first-time buyer, and whether you already own another property (which triggers a higher rate surcharge).",
    whyItMatters:
      "Your solicitor calculates and submits your SDLT return to HMRC within 14 days of completion. Getting the calculation wrong can result in penalties and interest.",
    legislation: "Finance Act 2003, Part 4",
    applies: "both",
    relatedTerms: ["completion", "first-time-buyer-relief"],
    letter: "S",
  },
  {
    term: "Section 20 Notice",
    slug: "section-20-notice",
    definition:
      "A statutory consultation notice that a landlord must serve on leaseholders before carrying out qualifying works costing more than £250 per leaseholder, or entering into a qualifying long-term agreement costing more than £100 per leaseholder per year.",
    whyItMatters:
      "If the landlord fails to follow the Section 20 consultation process, the maximum amount recoverable from each leaseholder is capped at £250 (for works) unless a dispensation is granted by the tribunal.",
    legislation: "Landlord and Tenant Act 1985, s.20; Service Charges (Consultation Requirements) (England) Regulations 2003",
    applies: "leasehold",
    relatedTerms: ["service-charge", "leasehold"],
    letter: "S",
  },
  {
    term: "Service Charge",
    slug: "service-charge",
    definition:
      "A payment made by a leaseholder towards the cost of services provided by the landlord or management company, such as building maintenance, insurance, cleaning of communal areas, and management fees. Service charges must be reasonable and the costs must be properly incurred.",
    whyItMatters:
      "High or escalating service charges can significantly affect the affordability of a leasehold property. Your solicitor will review the service charge accounts and any planned major works before you commit to the purchase.",
    legislation: "Landlord and Tenant Act 1985, s.18–30",
    applies: "leasehold",
    relatedTerms: ["leasehold", "management-company", "section-20-notice"],
    letter: "S",
  },
  {
    term: "Share of Freehold",
    slug: "share-of-freehold",
    definition:
      "An arrangement where leaseholders collectively own the freehold of their building, usually through a company in which each leaseholder holds a share. This gives them control over management decisions and the ability to grant themselves long lease extensions at minimal cost.",
    whyItMatters:
      "A share of freehold is generally seen as advantageous because it gives you a say in how the building is managed and allows you to extend your lease cheaply. Your solicitor will check the company structure and articles of association.",
    applies: "leasehold",
    relatedTerms: ["freehold", "leasehold", "lease-extension", "management-company"],
    letter: "S",
  },
  {
    term: "Source of Funds",
    slug: "source-of-funds",
    definition:
      "The origin of the money being used to fund a property purchase, such as savings, a mortgage, inheritance, or a gift from a family member. Solicitors must verify the source of funds as part of their anti-money laundering obligations.",
    whyItMatters:
      "You will need to provide evidence of where your purchase money is coming from. Failure to provide satisfactory evidence may delay your transaction or prevent your solicitor from acting.",
    legislation: "Money Laundering Regulations 2017, reg.28",
    applies: "both",
    relatedTerms: ["aml-anti-money-laundering", "source-of-wealth", "client-due-diligence", "proceeds-of-crime"],
    letter: "S",
  },
  {
    term: "Source of Wealth",
    slug: "source-of-wealth",
    definition:
      "The broader picture of how a client has accumulated their overall wealth over time, as distinct from the specific source of funds for a particular transaction. In higher-risk situations, solicitors may need to investigate source of wealth as part of enhanced due diligence.",
    whyItMatters:
      "For higher-value purchases or where risk factors are present, your solicitor may ask detailed questions about your employment history, business interests and how you have built your wealth over time.",
    legislation: "Money Laundering Regulations 2017, reg.33",
    applies: "both",
    relatedTerms: ["aml-anti-money-laundering", "source-of-funds", "enhanced-due-diligence", "wealth-narrative"],
    letter: "S",
  },
  {
    term: "Stamp Duty First-Time Buyer Relief",
    slug: "first-time-buyer-relief",
    definition:
      "A reduction in SDLT available to first-time buyers purchasing a property as their main residence. Subject to price thresholds, first-time buyers pay no SDLT on the first portion of the purchase price and a reduced rate on the remainder.",
    whyItMatters:
      "If you qualify as a first-time buyer, you could save thousands of pounds in SDLT. Your solicitor will confirm your eligibility and apply the relief in the SDLT return.",
    legislation: "Finance Act 2003, s.57B (as amended)",
    applies: "both",
    relatedTerms: ["sdlt"],
    letter: "S",
  },
  {
    term: "Statutory Declaration",
    slug: "statutory-declaration",
    definition:
      "A written statement of facts signed in the presence of a solicitor, commissioner for oaths, or other authorised person. In conveyancing, statutory declarations are often used to address gaps in the title, such as confirming long use of a right of way or absence of adverse claims.",
    whyItMatters:
      "If there is a defect or uncertainty in the title, a statutory declaration from the seller or a previous owner can help to cure or mitigate the issue, sometimes supported by indemnity insurance.",
    legislation: "Statutory Declarations Act 1835",
    applies: "both",
    relatedTerms: ["defective-title", "indemnity-insurance"],
    letter: "S",
  },
  // ──── T ────
  {
    term: "Tenants in Common",
    slug: "tenants-in-common",
    definition:
      "A form of co-ownership where each owner holds a defined share of the property (which may be equal or unequal). Unlike joint tenancy, there is no right of survivorship — each owner's share passes under their will or intestacy rules on death.",
    whyItMatters:
      "Holding as tenants in common is appropriate when co-owners contribute unequal amounts or want their share to pass to someone other than the surviving co-owner. A Declaration of Trust should record the shares.",
    legislation: "Law of Property Act 1925, s.36(2)",
    applies: "both",
    relatedTerms: ["joint-tenants", "declaration-of-trust", "beneficial-interest"],
    letter: "T",
  },
  {
    term: "Title Deeds",
    slug: "title-deeds",
    definition:
      "The physical documents that prove ownership of a property. For registered land, the paper deeds have been largely replaced by the electronic register at Land Registry, though original deeds may still be needed for historical information.",
    whyItMatters:
      "Your solicitor will review the title deeds (or official copies for registered land) to ensure there are no issues that could affect your ownership or use of the property.",
    applies: "both",
    relatedTerms: ["official-copies", "registered-title"],
    letter: "T",
  },
  {
    term: "Title Number",
    slug: "title-number",
    definition:
      "A unique reference number allocated by HM Land Registry to each registered title. The title number is used to identify and search for information about the property on the Land Registry register.",
    whyItMatters:
      "Your solicitor uses the title number to obtain official copies of the register and title plan, and to submit searches and applications at Land Registry.",
    applies: "both",
    relatedTerms: ["land-registry", "official-copies"],
    letter: "T",
  },
  {
    term: "TP1 Form",
    slug: "tp1-form",
    definition:
      "A Land Registry transfer deed used when only part of a registered title is being transferred. It is used instead of a TR1 where the seller is retaining some of the land and transferring the rest.",
    whyItMatters:
      "If you are buying part of a larger plot, your solicitor will use a TP1 to transfer only the land you are purchasing. The TP1 includes provisions for defining the transferred land and any new easements or covenants.",
    applies: "both",
    relatedTerms: ["tr1-form", "land-registry"],
    letter: "T",
  },
  {
    term: "TR1 Form",
    slug: "tr1-form",
    definition:
      "The standard Land Registry transfer deed used to transfer the whole of a registered title from one owner to another. It records the names of the transferor and transferee, the title number, the price, and any new provisions such as covenants or declarations of trust.",
    whyItMatters:
      "The TR1 is the document that legally transfers the property to you. Your solicitor will prepare it, arrange for signatures, and submit it to Land Registry after completion.",
    applies: "both",
    relatedTerms: ["land-registry", "completion", "engrossment"],
    letter: "T",
  },
  {
    term: "Tree Preservation Order (TPO)",
    slug: "tree-preservation-order",
    definition:
      "An order made by the local planning authority to protect specific trees, groups of trees or woodlands. It is an offence to cut down, top, lop, uproot or wilfully damage a protected tree without the authority's consent.",
    whyItMatters:
      "Your solicitor will check the local authority search results for any TPOs affecting the property. If you plan to carry out any work to trees, you will need consent or risk a fine.",
    legislation: "Town and Country Planning Act 1990, ss.198–210",
    applies: "both",
    relatedTerms: ["local-authority-search", "planning-permission"],
    letter: "T",
  },
  // ──── U ────
  {
    term: "Undertaking",
    slug: "undertaking",
    definition:
      "A binding promise given by a solicitor in the course of a transaction, most commonly to discharge an existing mortgage from the sale proceeds and to forward the signed DS1 form to the buyer's solicitor. Breach of an undertaking is a serious professional conduct matter.",
    whyItMatters:
      "Undertakings are how the conveyancing system works in practice — your solicitor relies on the seller's solicitor's undertaking to pay off the mortgage on completion. If an undertaking is breached, the solicitor can be disciplined by the SRA.",
    applies: "both",
    relatedTerms: ["completion", "ds1-form"],
    letter: "U",
  },
  {
    term: "Unregistered Land",
    slug: "unregistered-land",
    definition:
      "Land or property whose ownership is not recorded at HM Land Registry. Ownership of unregistered land is proved by examining the title deeds going back at least 15 years. Any dealing with unregistered land that triggers compulsory first registration must be registered within two months.",
    whyItMatters:
      "Unregistered land transactions are more complex and time-consuming because the buyer's solicitor must examine a chain of paper deeds rather than a simple register entry.",
    legislation: "Land Registration Act 2002, s.4",
    applies: "both",
    relatedTerms: ["registered-title", "first-registration", "abstract-of-title"],
    letter: "U",
  },
  // ──── V ────
  {
    term: "Vacant Possession",
    slug: "vacant-possession",
    definition:
      "The obligation of the seller to deliver the property empty of people and their belongings on completion. If the property is being sold with vacant possession, no one should be living in it or occupying it on the completion date.",
    whyItMatters:
      "If you are expecting to move in on completion day, you need the seller to give vacant possession. Your solicitor will ensure the contract contains this requirement.",
    applies: "both",
    relatedTerms: ["completion"],
    letter: "V",
  },
  // ──── W ────
  {
    term: "Water and Drainage Search",
    slug: "water-and-drainage-search",
    definition:
      "A search of the local water company's records revealing the location of public sewers and water mains in relation to the property, whether the property is connected to the public system, and whether any public drains cross the property.",
    whyItMatters:
      "If a public sewer crosses your property, you cannot build over it without the water company's consent. Your solicitor will review the results and advise on any restrictions or risks.",
    applies: "both",
    relatedTerms: ["pre-contract-searches"],
    letter: "W",
  },
  // ──── Additional terms to reach 100+ ────
  {
    term: "Apportionment",
    slug: "apportionment",
    definition:
      "The division of outgoings (such as ground rent, service charges and council tax) between buyer and seller on a pro-rata basis as at the completion date. The seller pays for the period up to completion; the buyer pays from completion onwards.",
    whyItMatters:
      "Your solicitor will calculate apportionments on the completion statement to ensure each party pays only their fair share of ongoing costs.",
    applies: "both",
    relatedTerms: ["completion-statement", "ground-rent", "service-charge"],
    letter: "A",
  },
  {
    term: "Assignment",
    slug: "assignment",
    definition:
      "The transfer of an existing lease from one person (the assignor) to another (the assignee). Most leases require the landlord's consent before an assignment can take place.",
    whyItMatters:
      "When you buy a leasehold property, the seller 'assigns' the lease to you. Your solicitor will ensure the assignment is properly documented and the landlord's consent obtained if required.",
    applies: "leasehold",
    relatedTerms: ["licence-to-assign", "leasehold"],
    letter: "A",
  },
  {
    term: "Certificate of Title",
    slug: "certificate-of-title",
    definition:
      "A report prepared by the buyer's solicitor for the mortgage lender, certifying that the title to the property is good and marketable and that the lender's requirements (as set out in the Lender's Handbook) have been met.",
    whyItMatters:
      "The lender will not release mortgage funds until it receives a satisfactory certificate of title from your solicitor. This is one of the final steps before completion.",
    applies: "both",
    relatedTerms: ["lenders-handbook", "mortgage"],
    letter: "C",
  },
  {
    term: "Commonhold",
    slug: "commonhold",
    definition:
      "An alternative form of flat ownership introduced by the Commonhold and Leasehold Reform Act 2002. Each unit owner holds a freehold interest in their flat, with the communal areas managed by a commonhold association. Commonhold remains rare in practice.",
    whyItMatters:
      "Commonhold was intended as a replacement for leasehold but has seen very limited take-up. If you encounter a commonhold property, your solicitor will advise on the specific implications.",
    legislation: "Commonhold and Leasehold Reform Act 2002, Part 1",
    applies: "both",
    relatedTerms: ["freehold", "leasehold"],
    letter: "C",
  },
  {
    term: "Completion Date",
    slug: "completion-date",
    definition:
      "The date on which the transaction finalises, the purchase price is paid, and the buyer takes legal ownership and possession. The completion date is agreed between the parties and is fixed in the contract at exchange.",
    whyItMatters:
      "Missing the completion date can result in financial penalties, including interest on late completion and, in the worst case, a notice to complete and potential rescission of the contract.",
    applies: "both",
    relatedTerms: ["completion", "exchange-of-contracts", "notice-to-complete"],
    letter: "C",
  },
  {
    term: "Conveyance",
    slug: "conveyance",
    definition:
      "The legal document used to transfer ownership of unregistered land from seller to buyer. For registered land, the equivalent document is a Transfer (TR1 or TP1).",
    whyItMatters:
      "In older transactions or where land is unregistered, the conveyance is the key title deed. Your solicitor will examine it as part of the title investigation.",
    applies: "both",
    relatedTerms: ["tr1-form", "unregistered-land"],
    letter: "C",
  },
  {
    term: "Disbursements",
    slug: "disbursements",
    definition:
      "Costs paid by your solicitor on your behalf to third parties during the conveyancing process, such as Land Registry fees, search fees, SDLT and bank transfer charges. Disbursements are separate from the solicitor's own professional fees.",
    whyItMatters:
      "Your solicitor's quote will list the expected disbursements. These are pass-through costs that would apply regardless of which solicitor you instruct.",
    applies: "both",
    letter: "D",
  },
  {
    term: "Electronic Signature",
    slug: "electronic-signature",
    definition:
      "A digital method of signing documents. HM Land Registry accepts 'witnessed electronic signatures' for certain deeds, including transfers and charges, provided specific requirements are met. The witnessing must still be done by a person physically present.",
    whyItMatters:
      "Electronic signatures can speed up the conveyancing process, especially where parties are in different locations. Your solicitor will advise whether electronic execution is appropriate for your transaction.",
    legislation: "Electronic Communications Act 2000; Land Registration (Amendment) Rules 2008",
    applies: "both",
    letter: "E",
  },
  {
    term: "Enfranchisement (Collective)",
    slug: "collective-enfranchisement",
    definition:
      "The statutory right of qualifying leaseholders in a building containing two or more flats to jointly purchase the freehold of their building. At least two-thirds of the flats must be let on long leases, and at least half of those qualifying leaseholders must participate.",
    whyItMatters:
      "Buying the freehold gives leaseholders full control over management and the ability to grant themselves long lease extensions. Your solicitor will advise on eligibility and the process.",
    legislation: "Leasehold Reform, Housing and Urban Development Act 1993, Part I, Chapter I",
    applies: "leasehold",
    relatedTerms: ["share-of-freehold", "lease-extension"],
    letter: "E",
  },
  {
    term: "Exchange (Simultaneous)",
    slug: "simultaneous-exchange",
    definition:
      "Where exchange and completion take place on the same day, eliminating the gap between becoming legally bound and completing the purchase. This is common in auction purchases and some chain-free transactions.",
    whyItMatters:
      "Simultaneous exchange and completion reduces the time you are at risk but leaves no room for error. Your solicitor will ensure all funds, searches and documents are in place before proceeding.",
    applies: "both",
    relatedTerms: ["exchange-of-contracts", "completion"],
    letter: "E",
  },
  {
    term: "Freehold Covenant (Positive)",
    slug: "positive-covenant",
    definition:
      "A covenant that requires the owner to do something, such as maintain a boundary wall, contribute to road maintenance, or keep a building in good repair. Unlike restrictive covenants, positive covenants generally do not bind successive owners of freehold land.",
    whyItMatters:
      "The inability to enforce positive covenants against successors is a well-known limitation of freehold law and is one reason why estate rentcharges and management companies are used on modern developments.",
    applies: "freehold",
    relatedTerms: ["covenant", "restrictive-covenant", "estate-rentcharge"],
    letter: "F",
  },
  {
    term: "Gift (Property Transfer by Gift)",
    slug: "gift-transfer",
    definition:
      "A transfer of property for no monetary consideration (or at undervalue). Transfers by gift may have SDLT, inheritance tax and capital gains tax implications, and may be set aside in certain circumstances.",
    whyItMatters:
      "If you are receiving a property as a gift, your solicitor will advise on the tax consequences and ensure the transfer is properly documented and registered.",
    applies: "both",
    relatedTerms: ["tr1-form", "sdlt"],
    letter: "G",
  },
  {
    term: "Habendum",
    slug: "habendum",
    definition:
      "The part of a deed or conveyance that defines the estate or interest being granted, typically beginning with the words 'To have and to hold'. In modern practice, this is more commonly expressed in plain language.",
    whyItMatters:
      "You may encounter this term in older title deeds. Your solicitor will interpret any archaic language to confirm what interest was actually transferred.",
    applies: "both",
    letter: "H",
  },
  {
    term: "Higher Rate SDLT Surcharge",
    slug: "higher-rate-sdlt-surcharge",
    definition:
      "An additional 5% SDLT surcharge (increased from 3% with effect from 31 October 2024) payable on the purchase of additional residential properties, such as buy-to-let investments or second homes. The surcharge applies on top of the standard SDLT rates.",
    whyItMatters:
      "If you already own another property anywhere in the world, you may have to pay the higher rate surcharge. Your solicitor will confirm whether the surcharge applies to your purchase.",
    legislation: "Finance Act 2003, Sch.4ZA (as amended by Autumn Budget 2024)",
    applies: "both",
    relatedTerms: ["sdlt"],
    letter: "H",
  },
  {
    term: "Incumbrance",
    slug: "incumbrance",
    definition:
      "Any right, interest or liability attached to a property that may reduce its value or restrict its use. Examples include mortgages, easements, restrictive covenants and leases. A seller usually covenants to sell free from incumbrances except those disclosed.",
    whyItMatters:
      "Your solicitor will identify all incumbrances affecting the property and ensure you understand their implications before you exchange contracts.",
    applies: "both",
    relatedTerms: ["charge", "easement", "restrictive-covenant"],
    letter: "I",
  },
  {
    term: "Land Charges Search",
    slug: "land-charges-search",
    definition:
      "A search of the Land Charges Register (separate from HM Land Registry) used primarily in unregistered land transactions. It reveals registered charges, pending court actions and other matters registered against the property owner's name.",
    whyItMatters:
      "For unregistered land, the land charges search is essential to discover interests that could affect your purchase but would not appear on any other register.",
    applies: "both",
    relatedTerms: ["k16-search", "unregistered-land"],
    letter: "L",
  },
  {
    term: "Leasehold Reform",
    slug: "leasehold-reform",
    definition:
      "The ongoing programme of legislative change aimed at improving the rights of leaseholders, including lease extension rights, collective enfranchisement, ground rent reform, and the right to manage. The Leasehold and Freehold Reform Act 2024 is the latest major reform.",
    whyItMatters:
      "Leasehold reform legislation is evolving. Your solicitor will advise on how current and forthcoming reforms may affect your leasehold purchase, including any changes to premiums for lease extensions.",
    legislation: "Leasehold and Freehold Reform Act 2024; Leasehold Reform (Ground Rent) Act 2022",
    applies: "leasehold",
    relatedTerms: ["lease-extension", "ground-rent", "collective-enfranchisement"],
    letter: "L",
  },
  {
    term: "Misrepresentation",
    slug: "misrepresentation",
    definition:
      "A false statement of fact made by one party (or their agent) that induces the other party to enter into a contract. In conveyancing, misrepresentation most commonly arises from incorrect answers on the Property Information Form (TA6) or Seller's replies to enquiries.",
    whyItMatters:
      "If the seller misrepresents a material fact about the property, you may have a claim for damages or, in serious cases, the right to rescind the contract.",
    legislation: "Misrepresentation Act 1967",
    applies: "both",
    relatedTerms: ["property-information-form", "caveat-emptor"],
    letter: "M",
  },
  {
    term: "New-Build Property",
    slug: "new-build-property",
    definition:
      "A property being sold for the first time by a developer or builder. New-build purchases involve additional considerations such as NHBC or similar warranty, snagging inspections, CML/UK Finance requirements, and the developer's contract package.",
    whyItMatters:
      "Your solicitor will review the developer's contract package carefully. New-build transactions often have tight deadlines and less room for negotiation on contract terms.",
    applies: "both",
    letter: "N",
  },
  {
    term: "Non-UK Resident Surcharge",
    slug: "non-uk-resident-surcharge",
    definition:
      "An additional 2% SDLT surcharge payable by purchasers who are not UK resident at the date of completion. For companies, non-UK resident status is determined by where the company is incorporated or where its central management and control is exercised.",
    whyItMatters:
      "If you are not UK resident, your solicitor must apply the additional 2% surcharge in the SDLT calculation. You may be able to claim a refund if you become UK resident within a specified period.",
    legislation: "Finance Act 2003, Sch.4ZB",
    applies: "both",
    relatedTerms: ["sdlt"],
    letter: "N",
  },
  {
    term: "Notice (on the Register)",
    slug: "notice-on-register",
    definition:
      "An entry on the register of title at Land Registry protecting certain interests, such as a spouse's home rights, an option to purchase, or an equitable charge. A notice ensures that the interest is binding on future purchasers.",
    whyItMatters:
      "Your solicitor will check for any notices on the title register that could affect your purchase. Some notices may need to be removed before completion can proceed.",
    legislation: "Land Registration Act 2002, ss.32–39",
    applies: "both",
    relatedTerms: ["land-registry", "restriction"],
    letter: "N",
  },
  {
    term: "Option Agreement",
    slug: "option-agreement",
    definition:
      "A contract giving one party the right (but not the obligation) to purchase a property at a specified price within a specified period. The option is usually protected by a notice on the title register.",
    whyItMatters:
      "If there is an option agreement registered against the property, it could give a third party the right to buy the property, potentially preventing or delaying your purchase.",
    applies: "both",
    relatedTerms: ["notice-on-register"],
    letter: "O",
  },
  {
    term: "Party Wall",
    slug: "party-wall",
    definition:
      "A wall shared between two properties, or a wall built along the boundary between two properties. The Party Wall etc. Act 1996 sets out the rights and obligations of property owners when carrying out work that affects a party wall.",
    whyItMatters:
      "If you plan to carry out building work affecting a party wall, you must serve notice on your neighbour and may need a party wall agreement. Your solicitor will check for any party wall issues as part of the transaction.",
    legislation: "Party Wall etc. Act 1996",
    applies: "both",
    letter: "P",
  },
  {
    term: "Power of Attorney",
    slug: "power-of-attorney",
    definition:
      "A legal document authorising one person (the attorney) to act on behalf of another (the donor) in legal and financial matters. In conveyancing, a power of attorney may be used if the seller or buyer cannot attend to sign documents in person.",
    whyItMatters:
      "If you are unable to sign documents yourself, your solicitor can arrange for an attorney to act on your behalf, subject to the lender's approval if a mortgage is involved.",
    legislation: "Powers of Attorney Act 1971; Mental Capacity Act 2005",
    applies: "both",
    letter: "P",
  },
  {
    term: "Reservation (New Estate)",
    slug: "reservation",
    definition:
      "A fee paid to a developer to reserve a new-build property, typically taking it off the market while the buyer arranges their mortgage and solicitor. Reservation fees are usually non-refundable if the buyer withdraws.",
    whyItMatters:
      "Before paying a reservation fee, understand whether it is refundable and what conditions apply. Your solicitor should advise on the terms of the reservation agreement.",
    applies: "both",
    relatedTerms: ["new-build-property"],
    letter: "R",
  },
  {
    term: "Restriction (on the Register)",
    slug: "restriction",
    definition:
      "An entry on the title register at Land Registry that limits the circumstances in which a disposition can be registered. For example, a restriction may require that purchase money is paid to at least two trustees, or that a named person consents to any sale.",
    whyItMatters:
      "Your solicitor must comply with any restriction on the title before the purchase can be registered. Common restrictions relate to trusts, companies and mortgage conditions.",
    legislation: "Land Registration Act 2002, ss.40–47",
    applies: "both",
    relatedTerms: ["land-registry", "rx1-form", "overreaching"],
    letter: "R",
  },
  {
    term: "Snagging List",
    slug: "snagging-list",
    definition:
      "A list of defects, incomplete work or finishing issues identified in a new-build property before or shortly after completion. The developer is usually obligated to rectify snagging items within a specified period.",
    whyItMatters:
      "It is advisable to have a professional snagging inspection carried out before completion. Your solicitor can help ensure the developer's obligations to remedy defects are properly documented.",
    applies: "both",
    relatedTerms: ["new-build-property"],
    letter: "S",
  },
  {
    term: "Solicitor's Undertaking",
    slug: "solicitors-undertaking",
    definition:
      "A binding commitment given by a solicitor to another party in the course of professional practice. Breach of an undertaking can lead to disciplinary action by the SRA and personal liability for the solicitor.",
    whyItMatters:
      "The conveyancing system relies heavily on solicitors' undertakings — for example, the seller's solicitor undertakes to discharge the existing mortgage from the sale proceeds. This is why regulated status matters.",
    applies: "both",
    relatedTerms: ["undertaking"],
    letter: "S",
  },
  {
    term: "Telegraphic Transfer",
    slug: "telegraphic-transfer",
    definition:
      "An electronic bank-to-bank payment used to transfer completion funds between solicitors on the day of completion. Same-day transfers are also known as CHAPS (Clearing House Automated Payment System) payments.",
    whyItMatters:
      "Completion funds are transferred by telegraphic transfer (CHAPS) to ensure the money arrives on the same day. Your solicitor will request cleared funds from you in advance to ensure the payment can be made on time.",
    applies: "both",
    relatedTerms: ["completion"],
    letter: "T",
  },
  // ──── AML / KYC / Source of Wealth Terms ────
  {
    term: "Beneficial Owner",
    slug: "beneficial-owner",
    definition:
      "The natural person who ultimately owns or controls a legal entity, arrangement or asset. Under the Money Laundering Regulations 2017, a beneficial owner is generally a person holding more than 25% of the shares or voting rights in a company, or who otherwise exercises ultimate effective control over it.",
    whyItMatters:
      "When the purchaser is a company, trust or other legal entity, solicitors must look beyond the named directors to identify the individuals who ultimately benefit. This obligation cannot be avoided through nominee arrangements or layered corporate structures.",
    legislation: "Money Laundering Regulations 2017, reg.5",
    applies: "both",
    relatedTerms: ["aml-anti-money-laundering", "client-due-diligence", "ultimate-beneficial-owner"],
    letter: "B",
  },
  {
    term: "Client Due Diligence (CDD)",
    slug: "client-due-diligence",
    definition:
      "The standard set of checks a regulated firm must complete before and during a business relationship. CDD requires the firm to identify the client, verify their identity using reliable independent sources, understand the nature and purpose of the relationship, and conduct ongoing monitoring of transactions throughout the relationship.",
    whyItMatters:
      "CDD is the baseline AML obligation for every client. Your solicitor cannot act for you until they have verified who you are and understood the purpose of your transaction. Inadequate CDD exposes the firm to regulatory sanction and potential criminal liability.",
    legislation: "Money Laundering Regulations 2017, regs.27–28",
    applies: "both",
    relatedTerms: ["aml-anti-money-laundering", "enhanced-due-diligence", "simplified-due-diligence", "kyc-know-your-customer", "identity-verification"],
    letter: "C",
  },
  {
    term: "Client Risk Assessment",
    slug: "client-risk-assessment",
    definition:
      "A risk assessment carried out by a regulated firm to determine the level of money laundering or terrorist financing risk associated with a particular client or transaction. Factors considered include the client's country of origin, type of transaction, nature of the business relationship, and the delivery channel used.",
    whyItMatters:
      "The outcome of the risk assessment determines whether standard, simplified or enhanced due diligence applies. A higher-risk rating means more detailed questions and more documentation from you before the transaction can proceed.",
    legislation: "Money Laundering Regulations 2017, reg.28(12)–(14)",
    applies: "both",
    relatedTerms: ["aml-anti-money-laundering", "enhanced-due-diligence", "risk-based-approach", "client-due-diligence"],
    letter: "C",
  },
  {
    term: "POCA Consent",
    slug: "poca-consent",
    definition:
      "Permission obtained from the National Crime Agency (NCA) to proceed with a transaction where the regulated firm suspects criminal property is involved. Once a Suspicious Activity Report is filed, the NCA has 7 working days to grant or withhold consent. If no response is received within that period, the firm may proceed on the basis of deemed consent.",
    whyItMatters:
      "If your solicitor suspects the funds in your transaction may be connected to crime, they must pause the transaction and file a report with the NCA. They cannot tell you this has happened — doing so would be the offence of Tipping Off. The pause can cause unexpected delays with no explanation.",
    legislation: "Proceeds of Crime Act 2002, ss.335–336",
    applies: "both",
    relatedTerms: ["suspicious-activity-report", "proceeds-of-crime", "tipping-off", "money-laundering-reporting-officer"],
    letter: "C",
  },
  {
    term: "Electronic Identity Verification (eIDV)",
    slug: "electronic-identity-verification",
    definition:
      "The use of electronic databases and digital tools to verify a person's identity without relying solely on paper documents. eIDV cross-references data against credit bureau records, the electoral roll, passport chip data and other sources to confirm identity claims, and can simultaneously screen against sanctions and PEP databases.",
    whyItMatters:
      "Many solicitors now use automated eIDV platforms to complete identity checks more quickly and reliably. Where eIDV is used, you may be asked to enter your details online or scan documents via a smartphone app rather than attending with paper documents.",
    legislation: "Money Laundering Regulations 2017, reg.28(19)",
    applies: "both",
    relatedTerms: ["identity-verification", "client-due-diligence", "kyc-know-your-customer", "liveness-check"],
    letter: "E",
  },
  {
    term: "Enhanced Due Diligence (EDD)",
    slug: "enhanced-due-diligence",
    definition:
      "More rigorous AML checks applied when a client, transaction or business relationship is assessed as higher risk. EDD involves obtaining additional information about the client's source of funds, source of wealth, business activities and the purpose of the transaction, together with increased ongoing monitoring and, where relevant, senior management approval.",
    whyItMatters:
      "If your transaction is flagged as higher risk — because it involves a politically exposed person, a high-value purchase, unusual payment structures or a high-risk jurisdiction — your solicitor must apply EDD. Expect more detailed questions and more supporting documentation.",
    legislation: "Money Laundering Regulations 2017, reg.33; Sch.3 (high-risk factors)",
    applies: "both",
    relatedTerms: ["client-due-diligence", "politically-exposed-person", "source-of-wealth", "risk-based-approach", "client-risk-assessment"],
    letter: "E",
  },
  {
    term: "Identity Verification",
    slug: "identity-verification",
    definition:
      "The process of confirming that a person is who they claim to be. Standard identity verification under the Money Laundering Regulations requires at least one government-issued photo ID document (such as a passport or driving licence) and one document confirming current address (such as a utility bill or bank statement issued within the last three months).",
    whyItMatters:
      "You will be asked to provide identity documents at the start of any transaction with a regulated firm. Your solicitor cannot act for you until identity has been verified to the standard required by the Money Laundering Regulations.",
    legislation: "Money Laundering Regulations 2017, reg.28",
    applies: "both",
    relatedTerms: ["kyc-know-your-customer", "client-due-diligence", "electronic-identity-verification", "proof-of-address"],
    letter: "I",
  },
  {
    term: "Integration (Money Laundering)",
    slug: "integration-money-laundering",
    definition:
      "The third and final stage of money laundering, in which criminal proceeds that have been placed into the financial system and layered through complex transactions are reintroduced into the legitimate economy as apparently lawful funds. Property purchases are one of the most widely used integration methods globally.",
    whyItMatters:
      "Property transactions are a well-known vehicle for the integration of criminal funds. This is why conveyancers are required to verify the source of funds and source of wealth for all property purchases — to detect and disrupt money laundering at this stage.",
    legislation: "Proceeds of Crime Act 2002; Money Laundering Regulations 2017",
    applies: "both",
    relatedTerms: ["placement-money-laundering", "layering-money-laundering", "aml-anti-money-laundering", "source-of-funds"],
    letter: "I",
  },
  {
    term: "KYC (Know Your Customer)",
    slug: "kyc-know-your-customer",
    definition:
      "The process by which a regulated firm identifies and verifies its clients and assesses the risks associated with the business relationship. KYC encompasses identity verification, understanding beneficial ownership structures, assessing the purpose and nature of the relationship, and conducting ongoing monitoring of transactions throughout.",
    whyItMatters:
      "KYC is a core AML obligation for every solicitor, bank and regulated business in the UK. Every client — including property buyers, sellers and their connected parties — must pass KYC checks before a regulated firm can act for them.",
    legislation: "Money Laundering Regulations 2017, regs.27–30; FATF Recommendations",
    applies: "both",
    relatedTerms: ["client-due-diligence", "aml-anti-money-laundering", "identity-verification", "beneficial-owner", "ongoing-monitoring"],
    letter: "K",
  },
  {
    term: "Layering (Money Laundering)",
    slug: "layering-money-laundering",
    definition:
      "The second stage of money laundering, in which criminal proceeds are moved through a series of complex financial transactions to disguise their origin and make them difficult to trace. Common layering methods include multiple bank transfers across jurisdictions, currency exchanges, and the use of offshore corporate or trust structures.",
    whyItMatters:
      "Solicitors are trained to recognise layering indicators, such as funds passing through multiple accounts or jurisdictions in quick succession shortly before a property purchase. These patterns may trigger a requirement for additional due diligence or a Suspicious Activity Report.",
    legislation: "Proceeds of Crime Act 2002",
    applies: "both",
    relatedTerms: ["placement-money-laundering", "integration-money-laundering", "aml-anti-money-laundering"],
    letter: "L",
  },
  {
    term: "Liveness Check",
    slug: "liveness-check",
    definition:
      "A biometric verification technique used in digital identity processes to confirm that the person presenting their identity documents is physically present and alive, rather than a photograph, video or digitally manipulated image. The check typically involves the user recording a short selfie video or performing a specific action via a smartphone app.",
    whyItMatters:
      "Liveness checks are used to combat identity fraud in remote KYC processes, where the client does not meet their solicitor in person. Where your solicitor uses a digital ID verification platform, you may be asked to complete a liveness check as part of the onboarding process.",
    legislation: "Money Laundering Regulations 2017, reg.28",
    applies: "both",
    relatedTerms: ["identity-verification", "electronic-identity-verification", "kyc-know-your-customer"],
    letter: "L",
  },
  {
    term: "Money Laundering Reporting Officer (MLRO)",
    slug: "money-laundering-reporting-officer",
    definition:
      "The designated compliance officer at a regulated firm who receives internal suspicious activity reports from colleagues, decides whether to file an external Suspicious Activity Report with the National Crime Agency, and oversees the firm's overall AML compliance programme. All regulated firms must appoint a nominated MLRO and notify their supervisor of the appointment.",
    whyItMatters:
      "The MLRO is the primary AML gatekeeper at any law firm or regulated business. All internal concerns about potential money laundering must be escalated to the MLRO, who makes the final decision on external reporting. The MLRO bears personal regulatory responsibility for the adequacy of the firm's AML compliance.",
    legislation: "Money Laundering Regulations 2017, reg.21; Proceeds of Crime Act 2002, s.331",
    applies: "both",
    relatedTerms: ["aml-anti-money-laundering", "suspicious-activity-report", "poca-consent"],
    letter: "M",
  },
  {
    term: "Net Worth Statement",
    slug: "net-worth-statement",
    definition:
      "A document setting out a client's total assets (property, investments, savings, pension, business interests) and liabilities (mortgages, loans, other debts) to give a snapshot of their overall financial position at a point in time. In AML and KYC processes, a net worth statement helps a regulated firm assess whether a transaction is proportionate to the client's declared wealth.",
    whyItMatters:
      "For high-value transactions, your solicitor may ask you to provide a net worth statement to demonstrate that the purchase price is consistent with your financial position. Supporting evidence such as bank statements, property valuations or accountant's letters may be required.",
    applies: "both",
    relatedTerms: ["source-of-wealth", "enhanced-due-diligence", "wealth-narrative"],
    letter: "N",
  },
  {
    term: "Ongoing Monitoring",
    slug: "ongoing-monitoring",
    definition:
      "The continuing obligation on regulated firms to scrutinise a client's transactions and activity throughout the business relationship, to ensure they remain consistent with the firm's knowledge of the client and their business, and to keep CDD information up to date. The intensity of monitoring must be proportionate to the assessed risk level.",
    whyItMatters:
      "AML compliance does not end with the initial identity check. Solicitors must continue to monitor their clients throughout a matter and update records if circumstances change — for example, if a new source of funds is introduced mid-transaction or if the client's risk profile changes.",
    legislation: "Money Laundering Regulations 2017, reg.28(11)",
    applies: "both",
    relatedTerms: ["client-due-diligence", "aml-anti-money-laundering", "kyc-know-your-customer"],
    letter: "O",
  },
  {
    term: "Placement (Money Laundering)",
    slug: "placement-money-laundering",
    definition:
      "The first stage of money laundering, in which criminal proceeds — typically cash — are introduced into the legitimate financial system. Common placement methods include cash deposits into bank accounts, cash-intensive businesses, cash purchases of high-value assets, and structured deposits designed to avoid reporting thresholds.",
    whyItMatters:
      "Solicitors are alert to placement indicators such as large cash contributions to a property purchase or funds that arrive without a credible documented origin. These trigger additional scrutiny and, if unexplained, may require a Suspicious Activity Report to the NCA.",
    legislation: "Proceeds of Crime Act 2002",
    applies: "both",
    relatedTerms: ["layering-money-laundering", "integration-money-laundering", "aml-anti-money-laundering"],
    letter: "P",
  },
  {
    term: "Politically Exposed Person (PEP)",
    slug: "politically-exposed-person",
    definition:
      "A person who holds or has held a prominent public function — including heads of state, government ministers, members of parliament, senior judicial officials, senior military officers, central bank governors and executives of state-owned enterprises — or who is a close family member or known associate of such a person. PEPs are subject to enhanced due diligence because their position may expose them to greater risks of bribery and corruption.",
    whyItMatters:
      "If you or a close family member is a PEP, your solicitor must apply enhanced due diligence to your transaction. This means additional checks on your source of funds and source of wealth, and senior management approval may be required before the firm can act. Being classified as a PEP does not prevent a transaction from proceeding.",
    legislation: "Money Laundering Regulations 2017, regs.35–36",
    applies: "both",
    relatedTerms: ["enhanced-due-diligence", "aml-anti-money-laundering", "source-of-wealth", "sanctions-screening"],
    letter: "P",
  },
  {
    term: "Proceeds of Crime",
    slug: "proceeds-of-crime",
    definition:
      "Any property or financial benefit derived directly or indirectly from criminal conduct. Under the Proceeds of Crime Act 2002, it is a criminal offence to conceal, disguise, convert, transfer or remove criminal property, or to enter into any arrangement that facilitates the acquisition, retention, use or control of criminal property by or on behalf of another person.",
    whyItMatters:
      "Solicitors who handle transactions involving the proceeds of crime — even unwittingly — may commit a money laundering offence. This is the primary legal driver behind the AML checks and source of funds verification that all regulated firms must carry out before completing a transaction.",
    legislation: "Proceeds of Crime Act 2002, ss.327–329",
    applies: "both",
    relatedTerms: ["aml-anti-money-laundering", "suspicious-activity-report", "source-of-funds", "poca-consent"],
    letter: "P",
  },
  {
    term: "Proof of Address",
    slug: "proof-of-address",
    definition:
      "A document confirming a person's current residential address, used as part of the standard identity verification process. Accepted documents typically include a recent utility bill, council tax notice, bank statement or HMRC correspondence. Documents are generally required to have been issued within the last three months by a recognised institution.",
    whyItMatters:
      "Your solicitor will ask for a proof of address document as part of standard KYC checks. If you have recently moved, live overseas or do not receive paper bills, your solicitor can advise on acceptable alternatives such as a bank letter or council tax bill.",
    legislation: "Money Laundering Regulations 2017, reg.28",
    applies: "both",
    relatedTerms: ["identity-verification", "client-due-diligence", "kyc-know-your-customer"],
    letter: "P",
  },
  {
    term: "Risk-Based Approach",
    slug: "risk-based-approach",
    definition:
      "The core principle underpinning AML regulation, requiring firms to identify, assess and understand their money laundering and terrorist financing risks, and then apply preventive measures that are proportionate to those risks — directing greater scrutiny to higher-risk areas and clients while applying lighter-touch measures where risks are genuinely lower.",
    whyItMatters:
      "The risk-based approach means the level of AML checks you face depends on the assessed risk profile of your transaction. High-value purchases, unusual payment structures or connections to higher-risk jurisdictions attract closer scrutiny than a straightforward domestic transaction.",
    legislation: "Money Laundering Regulations 2017, reg.28; FATF Recommendations",
    applies: "both",
    relatedTerms: ["aml-anti-money-laundering", "client-risk-assessment", "enhanced-due-diligence", "simplified-due-diligence"],
    letter: "R",
  },
  {
    term: "Sanctions Screening",
    slug: "sanctions-screening",
    definition:
      "The process of checking a client, beneficial owner or counterparty against national and international sanctions lists — including those maintained by HM Treasury's Office of Financial Sanctions Implementation (OFSI), the UN Security Council, and the EU. A match prohibits most financial dealings and must be reported to OFSI immediately.",
    whyItMatters:
      "All regulated firms must screen clients against sanctions lists before and during a business relationship. A client who is a designated sanctioned person cannot complete a property transaction without an OFSI licence, and the firm must report the match immediately.",
    legislation: "Sanctions and Anti-Money Laundering Act 2018; Russia (Sanctions) (EU Exit) Regulations 2019",
    applies: "both",
    relatedTerms: ["aml-anti-money-laundering", "politically-exposed-person", "client-due-diligence"],
    letter: "S",
  },
  {
    term: "Simplified Due Diligence (SDD)",
    slug: "simplified-due-diligence",
    definition:
      "A reduced level of AML checks permitted where the risk of money laundering or terrorist financing is assessed as genuinely low. SDD allows lighter-touch monitoring but the firm must still verify the client's identity and must continuously review whether the low-risk assessment remains appropriate.",
    whyItMatters:
      "SDD may be applied to inherently lower-risk clients such as regulated financial institutions. It does not mean that no checks are carried out — firms must positively satisfy themselves that the risk is low before applying SDD, and must switch to standard or enhanced checks if circumstances change.",
    legislation: "Money Laundering Regulations 2017, reg.37; Sch.2 (lower-risk factors)",
    applies: "both",
    relatedTerms: ["client-due-diligence", "enhanced-due-diligence", "risk-based-approach"],
    letter: "S",
  },
  {
    term: "Suspicious Activity Report (SAR)",
    slug: "suspicious-activity-report",
    definition:
      "A formal report submitted by a regulated firm to the National Crime Agency (NCA) via the SARs Online portal, notifying the NCA that the firm knows or suspects that property is criminal property or that a person is involved in money laundering or terrorist financing. The NCA has 7 working days to grant or withhold consent to proceed.",
    whyItMatters:
      "If your solicitor suspects the funds in your transaction are connected to crime, they are legally required to file a SAR with the NCA. They are prohibited from telling you this has happened — disclosing the filing is the offence of Tipping Off. The transaction may need to pause while the NCA considers the report.",
    legislation: "Proceeds of Crime Act 2002, ss.330–332; Terrorism Act 2000, s.19",
    applies: "both",
    relatedTerms: ["aml-anti-money-laundering", "money-laundering-reporting-officer", "tipping-off", "poca-consent"],
    letter: "S",
  },
  {
    term: "Third-Party Reliance",
    slug: "third-party-reliance",
    definition:
      "A mechanism under the Money Laundering Regulations allowing a regulated firm to rely on the CDD carried out by another regulated firm — such as a bank, accountant or another law firm — rather than conducting its own full checks. The relying firm must obtain written confirmation that CDD was properly carried out and must be able to obtain copies of documents on request. The relying firm remains fully responsible for compliance.",
    whyItMatters:
      "In some transactions your solicitor may rely on identity checks carried out by your bank or another regulated professional, reducing duplication. They will obtain written confirmation and remain responsible for the adequacy of those checks.",
    legislation: "Money Laundering Regulations 2017, reg.39",
    applies: "both",
    relatedTerms: ["client-due-diligence", "aml-anti-money-laundering", "kyc-know-your-customer"],
    letter: "T",
  },
  {
    term: "Tipping Off",
    slug: "tipping-off",
    definition:
      "The criminal offence of disclosing to a person under investigation for money laundering, or to a third party, that a Suspicious Activity Report has been made or that a money laundering investigation is underway, in circumstances likely to prejudice any investigation. Both direct and indirect disclosure are covered, including where the person knows or suspects the information will reach the suspect.",
    whyItMatters:
      "If your solicitor has filed a SAR, they are legally prohibited from telling you. This explains why a solicitor may appear to pause a transaction or go silent without explanation — they cannot disclose the reason until the NCA has responded, even if you ask directly.",
    legislation: "Proceeds of Crime Act 2002, s.333A; Terrorism Act 2000, s.21D",
    applies: "both",
    relatedTerms: ["suspicious-activity-report", "money-laundering-reporting-officer", "poca-consent"],
    letter: "T",
  },
  {
    term: "Ultimate Beneficial Owner (UBO)",
    slug: "ultimate-beneficial-owner",
    definition:
      "The natural person who ultimately owns or controls a legal entity, trust or other arrangement, traced through any layers of corporate or trust structure. Under the Money Laundering Regulations, UBOs holding more than 25% of shares or voting rights, or otherwise exercising ultimate effective control, must be identified and their identity verified.",
    whyItMatters:
      "If a company or trust is involved in a property transaction, solicitors must trace the ownership structure all the way back to the individual human beings who ultimately benefit — not just the named directors. Shell companies and nominee arrangements do not exempt this obligation.",
    legislation: "Money Laundering Regulations 2017, reg.5; Companies Act 2006 (PSC Register); Economic Crime (Transparency and Enforcement) Act 2022 (Register of Overseas Entities)",
    applies: "both",
    relatedTerms: ["beneficial-owner", "client-due-diligence", "aml-anti-money-laundering"],
    letter: "U",
  },
  {
    term: "Wealth Narrative",
    slug: "wealth-narrative",
    definition:
      "A written account provided by a client explaining how they have accumulated their overall wealth over time, covering employment history, business activities, investments, inheritances, gifts and other significant financial events. The wealth narrative forms a central part of the source of wealth documentation required for enhanced due diligence on higher-risk clients.",
    whyItMatters:
      "For higher-risk or high-value transactions, your solicitor may ask you to provide a written explanation of your financial history. Supporting documents — such as payslips, business accounts, tax returns or probate records — will usually be required to corroborate the narrative.",
    legislation: "Money Laundering Regulations 2017, reg.33",
    applies: "both",
    relatedTerms: ["source-of-wealth", "enhanced-due-diligence", "net-worth-statement"],
    letter: "W",
  },
  {
    term: "Wayleave",
    slug: "wayleave",
    definition:
      "A licence or agreement granting a utility company or other party the right to install and maintain equipment (such as electricity cables, water pipes or telecommunications) on or under private land.",
    whyItMatters:
      "Your solicitor will check for any wayleaves affecting the property, which could restrict where you can build or how you use certain areas of the land.",
    applies: "both",
    relatedTerms: ["easement"],
    letter: "W",
  },
];

/**
 * 10 FAQ entries for the bottom of the page — optimised for featured snippet selection.
 */
export const glossaryFaqs = [
  {
    question: "What is exchange of contracts?",
    answer:
      "Exchange of contracts is the point in a property transaction when the buyer and seller become legally bound. Signed contracts are swapped by telephone using the Law Society formulae, a deposit is paid, and a completion date is fixed. After exchange, neither party can withdraw without serious financial consequences.",
  },
  {
    question: "What does completion mean in conveyancing?",
    answer:
      "Completion is the final step of a property purchase. The buyer's solicitor transfers the purchase money, the seller's solicitor confirms receipt and authorises release of the keys, and the buyer becomes the legal owner. The buyer's solicitor then pays SDLT and applies to register the new ownership at Land Registry.",
  },
  {
    question: "What is a TR1 form?",
    answer:
      "A TR1 is the standard Land Registry transfer deed used to transfer the whole of a registered title from one owner to another. It records the price, the parties, the title number, and any declarations of trust or new covenants.",
  },
  {
    question: "What is a leasehold property?",
    answer:
      "A leasehold property is one where the owner holds a lease for a fixed period (often 99 or 125 years) rather than owning the land outright. Leaseholders typically pay ground rent and service charges to the freeholder or management company.",
  },
  {
    question: "What is SDLT (Stamp Duty Land Tax)?",
    answer:
      "SDLT is a tax payable when you buy a property in England or Northern Ireland above certain price thresholds. The amount depends on the purchase price, whether you are a first-time buyer, and whether you already own another property.",
  },
  {
    question: "What is an estate rentcharge?",
    answer:
      "An estate rentcharge is an annual charge on a freehold property (usually on a modern housing estate) to fund maintenance of communal areas not adopted by the council. Non-payment can have serious consequences, including the rentcharge owner's right to grant a lease over your property.",
  },
  {
    question: "What is a restrictive covenant?",
    answer:
      "A restrictive covenant is a binding promise in a deed that limits what you can do with your property — for example, preventing you from building above a certain height or running a business from home. Restrictive covenants run with the land and bind future owners.",
  },
  {
    question: "What does the Building Safety Act do?",
    answer:
      "The Building Safety Act 2022 reformed the regulation of higher-risk buildings (18m+ or 7+ storeys), created the Building Safety Regulator, and introduced protections for leaseholders against remediation costs for historical building safety defects.",
  },
  {
    question: "What is indemnity insurance in conveyancing?",
    answer:
      "Indemnity insurance is a one-off insurance policy that protects the buyer and their lender against financial loss from a known or potential title defect, such as missing building regulations approval or a possible breach of a restrictive covenant.",
  },
  {
    question: "What are official copies from Land Registry?",
    answer:
      "Official copies are documents obtained from HM Land Registry showing the current registered owner, charges, restrictions and other entries on the title. They include the title register (text) and the title plan (map). They are the starting point for investigating title in any conveyancing transaction.",
  },
  {
    question: "Why does my solicitor need to verify my identity?",
    answer:
      "Solicitors in England and Wales are required by the Money Laundering Regulations 2017 to verify the identity of every client before they can act for them. This means checking photo ID and proof of address, and in some cases investigating the source of the funds being used in the transaction. Failure to carry out these checks is a criminal offence for the firm. Electronic identity verification platforms are increasingly used to make the process faster and more convenient.",
  },
  {
    question: "What is a source of wealth check?",
    answer:
      "A source of wealth check goes beyond verifying where the specific transaction funds come from (source of funds) to understand how the client has built up their overall wealth over time. It may involve a written wealth narrative, supporting documents such as payslips, business accounts, tax returns or probate records, and a net worth statement. Source of wealth checks are required for higher-risk transactions and clients under the Money Laundering Regulations 2017, particularly where Enhanced Due Diligence applies.",
  },
  {
    question: "What is a Suspicious Activity Report (SAR)?",
    answer:
      "A Suspicious Activity Report is a formal report submitted to the National Crime Agency (NCA) by a regulated firm that knows or suspects a transaction involves criminal property. The NCA has 7 working days to respond. Filing a SAR does not mean the client is guilty of any wrongdoing — it is a precautionary legal obligation. Critically, the firm cannot tell the client that a SAR has been submitted, because doing so would be the criminal offence of Tipping Off. This can cause unexplained pauses in a transaction.",
  },
  {
    question: "What is a Politically Exposed Person (PEP)?",
    answer:
      "A Politically Exposed Person is someone who holds or has held a prominent public function — such as a government minister, member of parliament, senior judge, military officer or state enterprise executive — or who is a close family member or known associate of such a person. PEPs are subject to Enhanced Due Diligence because their position may expose them to corruption or bribery risks. Being a PEP does not prevent a transaction from proceeding, but it requires additional scrutiny of source of funds and source of wealth.",
  },
  {
    question: "What documents are needed for AML checks on a property purchase?",
    answer:
      "For a standard property purchase, your solicitor will typically require: (1) a government-issued photo ID such as a passport or driving licence; (2) proof of your current address — for example a recent utility bill, bank statement or council tax notice; and (3) evidence of the source of your purchase funds, such as bank statements, a mortgage offer, or documentation of an inheritance or gift. For higher-value or higher-risk transactions, additional documents such as payslips, business accounts, or a written source of wealth explanation may also be required.",
  },
];
