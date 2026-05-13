import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Search, BookOpen, ChevronDown, ExternalLink, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PublicNav from "@/components/PublicNav";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import { glossaryTerms as staticTerms, glossaryFaqs, type GlossaryTerm } from "@/data/glossaryTerms";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useGlossaryAnalytics } from "@/hooks/useGlossaryAnalytics";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const Glossary = () => {
  const [search, setSearch] = useState("");
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const { trackSearch, trackClick } = useGlossaryAnalytics();
  const [dbTerms, setDbTerms] = useState<GlossaryTerm[] | null>(null);

  // Hybrid: try database first, fall back to static
  useEffect(() => {
    supabase
      .from("glossary_terms")
      .select("*")
      .eq("status", "published")
      .order("term")
      .then(({ data }) => {
        if (data && data.length > 0) {
          setDbTerms(
            data.map((d: any) => ({
              term: d.term,
              slug: d.slug,
              definition: d.definition,
              whyItMatters: d.why_it_matters,
              legislation: d.legislation ?? undefined,
              applies: d.applies as "leasehold" | "freehold" | "both",
              relatedTerms: d.related_term_slugs ?? [],
              letter: d.letter,
            }))
          );
        }
      });
  }, []);

  const glossaryTerms = dbTerms ?? staticTerms;

  // letters that have terms
  const availableLetters = useMemo(
    () => new Set(glossaryTerms.map((t) => t.letter)),
    [glossaryTerms]
  );

  // filter terms
  const filtered = useMemo(() => {
    let items = glossaryTerms;
    if (activeLetter) items = items.filter((t) => t.letter === activeLetter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (t) =>
          t.term.toLowerCase().includes(q) ||
          t.definition.toLowerCase().includes(q) ||
          t.whyItMatters.toLowerCase().includes(q)
      );
    }
    return items.sort((a, b) => a.term.localeCompare(b.term));
  }, [search, activeLetter, glossaryTerms]);

  // group by letter
  const grouped = useMemo(() => {
    const map = new Map<string, GlossaryTerm[]>();
    filtered.forEach((t) => {
      const arr = map.get(t.letter) || [];
      arr.push(t);
      map.set(t.letter, arr);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const toggle = (slug: string) => {
    const next = openSlug === slug ? null : slug;
    setOpenSlug(next);
    if (next) trackClick(slug);
  };

  // SEO meta
  useEffect(() => {
    document.title =
      "Conveyancing & Property Law Glossary (UK) | Olimey AI";
    const desc = document.querySelector('meta[name="description"]');
    if (desc)
      desc.setAttribute(
        "content",
        "Plain-English glossary of 100+ UK conveyancing, property and property law terms — from SDLT to TR1, leasehold to freehold. Accurate, fact-checked definitions for home buyers and sellers."
      );
  }, []);

  // resolve related term names
  const termMap = useMemo(() => {
    const m = new Map<string, string>();
    glossaryTerms.forEach((t) => m.set(t.slug, t.term));
    return m;
  }, [glossaryTerms]);

  const appliesLabel = (a: string) =>
    a === "leasehold" ? "Leasehold" : a === "freehold" ? "Freehold" : "Freehold & Leasehold";

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      {/* JSON-LD: FAQPage */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: glossaryFaqs.map((f) => ({
              "@type": "Question",
              name: f.question,
              acceptedAnswer: { "@type": "Answer", text: f.answer },
            })),
          }),
        }}
      />

      {/* JSON-LD: DefinedTermSet */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "DefinedTermSet",
            name: "Conveyancing & Property Law Glossary (UK)",
            description:
              "Plain-English glossary of UK conveyancing, property and property law terms.",
            url: "https://olimey.ai/glossary",
            hasDefinedTerm: glossaryTerms.map((t) => ({
              "@type": "DefinedTerm",
              name: t.term,
              description: t.definition,
            })),
          }),
        }}
      />

      <div className="pt-24 pb-20 max-w-4xl mx-auto px-6">
        {/* Back */}
        <Button asChild variant="ghost" size="sm" className="mb-4 text-muted-foreground hover:text-foreground">
          <Link to="/">
            <ArrowLeft size={16} className="mr-2" /> Back to Home
          </Link>
        </Button>

        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="flex items-center gap-3 mb-2">
            <BookOpen size={28} className="text-accent" />
            <span className="text-xs font-semibold uppercase tracking-widest text-accent">Reference</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            Conveyancing &amp; Property Law Glossary (UK)
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg max-w-2xl leading-relaxed mb-8">
            Plain-English definitions of {glossaryTerms.length}+ conveyancing, property and property law terms — fact-checked against UK legislation, Land Registry practice guides and the Law Society.
          </p>
        </motion.div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input
            placeholder="Search terms (e.g. exchange, TR1, leasehold)…"
            value={search}
            onChange={(e) => {
              const val = e.target.value;
              setSearch(val);
              setActiveLetter(null);
              trackSearch(val, filtered.length);
            }}
            className="pl-10"
          />
        </div>

        {/* A–Z selector */}
        <div className="flex flex-wrap gap-1 mb-8">
          <Button
            variant={activeLetter === null ? "default" : "ghost"}
            size="sm"
            className={cn("h-8 w-8 p-0 text-xs", activeLetter === null && "bg-accent text-accent-foreground")}
            onClick={() => { setActiveLetter(null); setSearch(""); }}
          >
            All
          </Button>
          {ALPHABET.map((l) => {
            const has = availableLetters.has(l);
            return (
              <Button
                key={l}
                variant={activeLetter === l ? "default" : "ghost"}
                size="sm"
                disabled={!has}
                className={cn(
                  "h-8 w-8 p-0 text-xs",
                  activeLetter === l && "bg-accent text-accent-foreground",
                  !has && "opacity-30"
                )}
                onClick={() => { setActiveLetter(l); setSearch(""); }}
              >
                {l}
              </Button>
            );
          })}
        </div>

        {/* Results count */}
        <p className="text-sm text-muted-foreground mb-6">
          Showing {filtered.length} of {glossaryTerms.length} terms
        </p>

        {/* Grouped accordion */}
        {grouped.length === 0 && (
          <p className="text-muted-foreground py-12 text-center">No terms match your search.</p>
        )}

        {grouped.map(([letter, terms]) => (
          <div key={letter} className="mb-8">
            <h2 className="text-2xl font-bold text-accent mb-3 border-b border-border/40 pb-2">{letter}</h2>
            <div className="space-y-2">
              {terms.map((t) => {
                const isOpen = openSlug === t.slug;
                return (
                  <div key={t.slug} id={`term-${t.slug}`} className="border border-border/40 rounded-lg overflow-hidden bg-card">
                    <button
                      onClick={() => toggle(t.slug)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                    >
                      <span className="font-semibold text-foreground text-sm sm:text-base">{t.term}</span>
                      <ChevronDown
                        size={18}
                        className={cn(
                          "text-muted-foreground transition-transform flex-shrink-0 ml-2",
                          isOpen && "rotate-180"
                        )}
                      />
                    </button>

                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-4 pb-4"
                      >
                        <p className="text-muted-foreground text-sm leading-relaxed mb-3">{t.definition}</p>

                        <h4 className="text-xs font-semibold uppercase tracking-wider text-accent mb-1">Why it matters</h4>
                        <p className="text-muted-foreground text-sm leading-relaxed mb-3">{t.whyItMatters}</p>

                        <div className="flex flex-wrap gap-2 text-xs mb-3">
                          <span className="bg-muted rounded-full px-3 py-1 text-muted-foreground">
                            {appliesLabel(t.applies)}
                          </span>
                          {t.legislation && (
                            <span className="bg-accent/10 text-accent rounded-full px-3 py-1">{t.legislation}</span>
                          )}
                        </div>

                        {t.relatedTerms && t.relatedTerms.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Related terms</h4>
                            <div className="flex flex-wrap gap-1.5">
                              {t.relatedTerms.map((slug) => (
                                <button
                                  key={slug}
                                  onClick={() => {
                                    setSearch("");
                                    setActiveLetter(null);
                                    setOpenSlug(slug);
                                    // Wait for DOM update then scroll to the target term
                                    setTimeout(() => {
                                      const el = document.getElementById(`term-${slug}`);
                                      if (el) {
                                        el.scrollIntoView({ behavior: "smooth", block: "center" });
                                      }
                                    }, 100);
                                  }}
                                  className="text-xs text-accent underline hover:text-accent/80"
                                >
                                  {termMap.get(slug) || slug}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* CTA */}
        <div className="my-12 p-6 rounded-2xl bg-gradient-to-r from-accent/10 to-primary/5 border border-accent/20 text-center">
          <h3 className="text-lg font-bold text-foreground mb-2">Still confused by a term?</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Our AI agents can explain these concepts in the context of your specific transaction — always reviewed by a qualified conveyancer.
          </p>
          <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/signup">
              Explore AI Agents <ExternalLink size={14} className="ml-1.5" />
            </Link>
          </Button>
        </div>

        {/* FAQ section */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
            <HelpCircle size={22} className="text-accent" />
            Frequently Asked Questions
          </h2>
          <div className="space-y-2">
            {glossaryFaqs.map((faq, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={i} className="border border-border/40 rounded-lg overflow-hidden bg-card">
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                  >
                    <span className="font-semibold text-foreground text-sm sm:text-base">{faq.question}</span>
                    <ChevronDown
                      size={18}
                      className={cn(
                        "text-muted-foreground transition-transform flex-shrink-0 ml-2",
                        isOpen && "rotate-180"
                      )}
                    />
                  </button>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="px-4 pb-4"
                    >
                      <p className="text-muted-foreground text-sm leading-relaxed">{faq.answer}</p>
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Disclaimer */}
        <div className="border-t border-border/30 pt-6 text-xs text-muted-foreground leading-relaxed">
          <p className="font-semibold mb-1">Disclaimer</p>
          <p>
            This glossary is for general information only and does not constitute legal advice. Definitions are simplified summaries of complex legal concepts. Always seek advice from a qualified conveyancer or solicitor. © {new Date().getFullYear()} Olimey AI.
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/30 py-10 bg-card/50">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Olimey AI. All rights reserved.</span>
          <div className="flex gap-4">
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/insights" className="hover:text-foreground transition-colors">Insights</Link>
            <Link to="/signup" className="hover:text-foreground transition-colors">AI Agents</Link>
          </div>
        </div>
      </footer>

      <CookieConsentBanner />
    </div>
  );
};

export default Glossary;
