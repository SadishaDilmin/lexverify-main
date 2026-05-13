import { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  ArrowDown,
  Gift,
  Info,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import LexSentinelLogo from "@/components/LexSentinelLogo";
import ROICalculator from "@/components/ROICalculator";
import FreeTrialBanner from "@/components/FreeTrialBanner";
import PublicNav from "@/components/PublicNav";
import {
  BASE_CREDITS_PER_AGENT,
  COMPLEXITY_MODIFIERS,
  CREDIT_BUNDLES,
  CASE_EXAMPLES,
  ADD_ON_DOCUMENTS,
  creditsPerAgent,
  CREDIT_PRICE_GBP,
} from "@/data/creditPricing";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);

const Pricing = () => {
  const bundlesRef = useRef<HTMLDivElement>(null);
  const [showStickyCta, setShowStickyCta] = useState(false);

  useEffect(() => {
    const el = bundlesRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyCta(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-80px 0px 0px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <main className="max-w-5xl mx-auto px-4 py-10 pt-24 space-y-12">
        {/* Free Trial Banner */}
        <FreeTrialBanner variant="hero" />
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-3"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-sm font-medium mb-2">
            <CreditCard size={15} />
            Pay-As-You-Go Credits
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            Simple, Transparent Pricing
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-base md:text-lg">
            No subscriptions. No lock-in. Buy credits upfront and use them when you need them.
            Credits are charged per AI agent, per case — with cost varying by case complexity.
          </p>
        </motion.div>

        {/* Credit Bundles — moved to top for conversion */}
        <motion.div
          ref={bundlesRef}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="space-y-6"
        >
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Credit Bundles</h2>
            <p className="text-muted-foreground text-sm">Buy in bulk and save up to 50%. Credits never expire.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CREDIT_BUNDLES.map((bundle, i) => {
              const isPopular = i === 2;
              return (
                <Card key={bundle.credits} className={`border-border relative ${isPopular ? "ring-2 ring-accent/40" : ""}`}>
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground text-xs font-bold px-3 py-0.5 rounded-full">
                      Most Popular
                    </div>
                  )}
                  <CardHeader className="pb-2 text-center">
                    <CardDescription className="text-xs font-semibold uppercase tracking-wider">{bundle.label}</CardDescription>
                    <CardTitle className="text-3xl font-bold text-foreground">{fmt(bundle.price)}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-center space-y-3">
                    <p className="text-sm text-muted-foreground">{bundle.credits.toLocaleString()} credits</p>
                    {bundle.discount > 0 && <p className="text-xs font-semibold text-accent">Save {bundle.discount}%</p>}
                    <p className="text-xs text-muted-foreground">{fmt(bundle.price / bundle.credits)}/credit</p>
                    <Separator />
                    <ul className="text-xs text-muted-foreground space-y-1.5 text-left">
                      <li className="flex items-center gap-1.5"><Check size={12} className="text-accent shrink-0" /> No expiry</li>
                      <li className="flex items-center gap-1.5"><Check size={12} className="text-accent shrink-0" /> No subscription</li>
                      <li className="flex items-center gap-1.5"><Check size={12} className="text-accent shrink-0" /> Top up anytime</li>
                    </ul>
                    <Link to="/buy-credits">
                      <Button className={`w-full gap-2 ${isPopular ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""}`} variant={isPopular ? "default" : "outline"}>
                        Buy Now <ArrowRight size={14} />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="text-center pt-2">
            <a href="#how-credits-work" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
              See how credits are calculated <ArrowDown size={14} />
            </a>
          </div>
        </motion.div>

        <Separator />

        {/* How it works */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15 }}
          className="grid sm:grid-cols-3 gap-6"
        >
          {[
            { icon: CreditCard, title: "1. Buy Credits", desc: "Purchase credit bundles upfront — the more you buy, the more you save." },
            { icon: Zap, title: "2. Use Per Case", desc: "Each AI agent consumes credits based on case complexity. Freehold is cheapest; complex cases cost more." },
            { icon: Sparkles, title: "3. Top Up Anytime", desc: "Credits never expire. When you run low, top up instantly. No contracts, cancel anytime." },
          ].map((step) => (
            <Card key={step.title} className="border-border text-center">
              <CardContent className="pt-6 flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                  <step.icon size={22} className="text-accent" />
                </div>
                <h3 className="font-semibold text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        <Separator />

        {/* Credit schedule */}
        <motion.div
          id="how-credits-work"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.2 }}
          className="space-y-6 scroll-mt-24"
        >
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Credit Schedule</h2>
            <p className="text-muted-foreground text-sm">
              Credits charged per AI agent, per case. {fmt(CREDIT_PRICE_GBP)} per credit.
            </p>
          </div>

          <Card className="border-border">
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-semibold text-foreground">Base — Freehold</p>
                    <p className="text-xs text-muted-foreground">Standard residential freehold purchase</p>
                  </div>
                  <span className="font-bold text-foreground">{BASE_CREDITS_PER_AGENT} credits</span>
                </div>
                <Separator />
                {COMPLEXITY_MODIFIERS.map((mod) => (
                  <div key={mod.id}>
                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-1.5">
                        <div>
                          <p className="font-semibold text-foreground">+ {mod.label}</p>
                          <p className="text-xs text-muted-foreground">{mod.description}</p>
                        </div>
                        {mod.blocksAI && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info size={14} className="text-destructive shrink-0 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs text-xs">
                                Unregistered land requires manual title deeds review and first registration analysis that cannot yet be reliably automated by AI agents.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <span className={`font-bold ${mod.blocksAI ? "text-destructive" : "text-accent"}`}>
                        {mod.blocksAI ? "AI blocked" : `+${mod.extraCredits} credits`}
                      </span>
                    </div>
                    <Separator />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Add-on Documents */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.22 }}
          className="space-y-6"
        >
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Optional Add-on Documents</h2>
            <p className="text-muted-foreground text-sm">
              Enable additional document types for leasehold cases — each adds extra credits per agent
            </p>
          </div>
          <Card className="border-border">
            <CardContent className="pt-6">
              <div className="space-y-3">
                {ADD_ON_DOCUMENTS.map((addon, i) => (
                  <div key={addon.id}>
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-semibold text-foreground">{addon.label}</p>
                        <p className="text-xs text-muted-foreground">{addon.description}</p>
                      </div>
                      <span className="font-bold text-accent">+{addon.extraCreditsPerAgent} credits/agent</span>
                    </div>
                    {i < ADD_ON_DOCUMENTS.length - 1 && <Separator />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Case examples */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.25 }}
          className="space-y-6"
        >
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Example Case Costs</h2>
            <p className="text-muted-foreground text-sm">Credits per agent for common case types</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CASE_EXAMPLES.map((ex) => {
              const cpa = creditsPerAgent(ex.factors);
              return (
                <Card key={ex.label} className="border-border">
                  <CardContent className="pt-5 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-foreground text-sm">{ex.label}</h3>
                      <span className="text-xs font-bold bg-accent/10 text-accent px-2 py-0.5 rounded-full">{cpa} cr/agent</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{ex.description}</p>
                    <p className="text-xs text-muted-foreground">
                      Cost per agent: <span className="font-semibold text-foreground">{fmt(cpa * CREDIT_PRICE_GBP)}</span>
                      {" · "}All 9 agents: <span className="font-semibold text-foreground">{fmt(cpa * 9 * CREDIT_PRICE_GBP)}</span>
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </motion.div>

        <Separator />

        {/* ═══════ EMBEDDED ROI CALCULATOR ═══════ */}
        <ROICalculator embedded id="calculator" />

        <Separator />

        {/* FAQ */}
        <div className="max-w-2xl mx-auto space-y-4 text-sm">
          <h3 className="font-semibold text-foreground text-center text-lg">Frequently Asked Questions</h3>
          {[
            { q: "Is there a free trial?", a: "Yes! Every new account gets 100 free credits — enough for multiple full AI case reviews. No credit card required. Just sign up." },
            { q: "Do credits expire?", a: "No — your credits never expire. Use them at your own pace." },
            { q: "Can I use different agents on the same case?", a: "Yes. Each agent is charged independently. Select only the agents you need per case." },
            { q: "What happens when credits run out?", a: "You'll be prompted to top up. No work is lost — simply purchase more credits to continue." },
            { q: "Is there a minimum purchase?", a: "The Starter bundle (100 credits / £100) is the minimum. That covers 20 standard freehold cases with one agent." },
            { q: "How does case complexity affect pricing?", a: "Freehold is the base rate (5 credits/agent). Complexity factors — Leasehold, New Build, BSA, Auction, Right to Buy, Shared Ownership, and Staircasing — each add extra credits to reflect the additional analysis required. Unregistered Land is currently unsupported by AI agents." },
            { q: "Can I get a bespoke volume deal?", a: "For firms processing 500+ cases per month, contact us for a tailored Enterprise arrangement." },
          ].map((item) => (
            <div key={item.q} className="border border-border rounded-lg p-4">
              <p className="font-medium text-foreground">{item.q}</p>
              <p className="text-muted-foreground mt-1">{item.a}</p>
            </div>
          ))}
        </div>

        {/* Final CTA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.3 }}
          className="text-center space-y-4"
        >
          <h2 className="text-2xl font-bold text-foreground">Ready to Transform Your Practice?</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Sign up and get 100 free credits — no commitment required. See the difference AI makes on a real case.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
              <Link to="/signup">
                <Gift size={14} /> Sign Up Free
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/signup">
                Explore AI Agents
              </Link>
            </Button>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16 py-6">
        <p className="text-center text-xs text-muted-foreground">
          © 2026 Olimey AI ·{" "}
          <Link to="/terms" className="text-accent hover:underline">Terms</Link>
          {" · "}
          <Link to="/privacy" className="text-accent hover:underline">Privacy</Link>
        </p>
      </footer>
      {/* Sticky Buy Now CTA bar */}
      <motion.div
        initial={false}
        animate={{ y: showStickyCta ? 0 : 80 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background/95 backdrop-blur-md shadow-lg"
      >
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-foreground hidden sm:block">
            Credits from <span className="text-accent font-bold">£1 each</span> — no subscription, no expiry
          </p>
          <p className="text-sm font-medium text-foreground sm:hidden">
            From <span className="text-accent font-bold">£1/credit</span>
          </p>
          <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2 whitespace-nowrap">
            <Link to="/buy-credits">
              <CreditCard size={14} /> Buy Credits <ArrowRight size={14} />
            </Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default Pricing;
