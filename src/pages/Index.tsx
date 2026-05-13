import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Shield, Zap, Clock, CheckCircle2, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import FreeTrialBanner from "@/components/FreeTrialBanner";
import PublicNav from "@/components/PublicNav";
import { agents } from "@/config/agents";

const visibleAgents = agents.filter((a) => a.available && a.published !== false);

const stats = [
  { value: "5 min", label: "Average Review Time" },
  { value: "30+", label: "Risk Checks Per Case" },
  { value: "100%", label: "Evidence-Cited" },
  { value: String(visibleAgents.length), label: "AI Agents" },
];

const features = visibleAgents
  .slice(0, 6)
  .map((a) => ({
    id: a.id,
    icon: a.icon ?? Shield,
    title: a.name,
    description: a.description,
    href: a.linkTo || "/dashboard",
    live: a.available && a.published !== false,
    betaTest: Boolean(a.betaTest),
  }));

const workflow = [
  { step: "01", title: "Upload Documents", description: "Drop your documents into the case workspace — our AI agent will handle the rest." },
  { step: "02", title: "AI Analysis", description: "Olimey AI reviews every page, cross-references findings, and scores risk." },
  { step: "03", title: "Review & Send", description: "Get a structured report, risk score, and draft enquiry email — ready to send." },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <FreeTrialBanner variant="compact" className="fixed top-4 right-4 z-50 hidden sm:inline-flex" />

      {/* Hero */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 sentinel-gradient opacity-[0.03]" />
        <div className="absolute top-20 right-0 w-[600px] h-[600px] rounded-full bg-accent/5 blur-3xl" />
        <div className="max-w-7xl mx-auto px-6 relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-3xl"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-sm font-medium mb-6">
              <Zap size={14} /> AI-Powered Legal Intelligence for Law Firms
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-foreground leading-[1.08] mb-6">
              AI agents built{" "}
              <span className="text-gradient">for law firms</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mb-8 leading-relaxed">
              Olimey AI — an AI-powered Source of Wealth assessment agent for UK conveyancers, aligned with MLR 2017, LSAG 2026, and POCA 2002. Sign up free and run your first AML assessment in minutes.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 text-base px-8 h-12 sentinel-glow">
                <Link to="/signup">
                  <Gift size={18} className="mr-2" /> Sign Up Free — 100 Credits
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="text-base px-8 h-12 border-primary text-primary hover:bg-primary/10">
                <Link to="/signup">
                  Explore AI Agents <ArrowRight size={18} className="ml-2" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 border-y border-border bg-card/50">
        <div className="max-w-7xl mx-auto px-6">
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="text-center"
              >
                <dt className="sr-only">{stat.label}</dt>
                <dd className="text-4xl sm:text-5xl font-bold text-gradient mb-1">{stat.value}</dd>
                <dt className="text-sm text-muted-foreground font-medium">{stat.label}</dt>
              </motion.div>
            ))}
          </dl>
        </div>
      </section>

      {/* Features */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              A growing suite of <span className="text-accent">AI agents</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Specialist AI agents for every stage of the conveyancing workflow — and beyond. New agents are added regularly, with Priority Access members always first in line.
            </p>
          </motion.div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <Link to={feature.href} key={feature.id}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.5 }}
                  className="group p-6 rounded-xl border border-border bg-card hover:border-accent/30 hover:shadow-lg transition-all duration-300 cursor-pointer h-full"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                      <feature.icon size={20} className="text-accent" />
                    </div>
                    {feature.live && feature.betaTest ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">LIVE — Beta Test</span>
                    ) : feature.live ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-risk-green-bg text-risk-green border border-risk-green/20">LIVE</span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">COMING SOON</span>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">{feature.description}</p>
                  <span className="text-sm font-medium text-accent inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                    Go to Portal <ArrowRight size={14} />
                  </span>
                </motion.div>
              </Link>
            ))}
          </div>
          <div className="text-center mt-10">
            <Button asChild variant="outline" size="lg" className="text-base px-8">
              <Link to="/signup">
                View All AI Agents <ArrowRight size={16} className="ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-card/50 border-y border-border">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Three steps to <span className="text-accent">risk clarity</span>
            </h2>
            <p className="text-muted-foreground text-lg">From upload to actionable insight — in under 5 minutes.</p>
          </motion.div>
          <ol className="grid md:grid-cols-3 gap-8 list-none p-0">
            {workflow.map((item, i) => (
              <motion.li
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.5 }}
                className="relative"
              >
                <div className="text-6xl font-bold text-accent/10 mb-2" aria-hidden="true">{item.step}</div>
                <h3 className="text-xl font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{item.description}</p>
                {i < workflow.length - 1 && (
                  <ArrowRight className="hidden md:block absolute top-8 -right-4 text-accent/20" size={24} aria-hidden="true" />
                )}
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="sentinel-gradient rounded-2xl p-12 sm:p-16 relative overflow-hidden"
          >
            <div className="absolute inset-0 opacity-10">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute rounded-full border border-accent/30"
                  style={{
                    width: `${150 + i * 100}px`,
                    height: `${150 + i * 100}px`,
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                  }}
                />
              ))}
            </div>
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Start using Olimey AI today
              </h2>
              <p className="text-white/60 text-lg mb-8 max-w-xl mx-auto">
                Sign up and get 100 free credits — no commitment, no credit card. See the difference AI makes on a real case.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 text-base px-8 h-12">
                  <Link to="/signup">
                    <Gift size={18} className="mr-2" /> Sign Up Free
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="text-base px-8 h-12 border-white/20 text-white hover:bg-white/10">
                  <Link to="/signup">
                    Explore AI Agents
                  </Link>
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div
                className="flex items-center justify-center rounded-md bg-primary"
                style={{ width: 28, height: 28 }}
              >
                <span className="font-bold text-primary-foreground text-xs leading-none">LS</span>
              </div>
              <span className="text-sm font-semibold tracking-tight">
                <span className="text-foreground">Lex</span>
                <span className="text-accent">Sentinel</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 pr-16 sm:pr-0">
              <Link to="/about" className="text-xs text-muted-foreground hover:text-accent transition-colors">
                About Us
              </Link>
              <Link to="/terms" className="text-xs text-muted-foreground hover:text-accent transition-colors">
                Terms & Conditions
              </Link>
              <Link to="/privacy" className="text-xs text-muted-foreground hover:text-accent transition-colors">
                Privacy Policy
              </Link>
              <p className="text-xs text-muted-foreground">
                © 2026 Olimey AI
              </p>
            </div>
          </div>
        </div>
      </footer>

      <CookieConsentBanner />
    </div>
  );
};

export default Index;
