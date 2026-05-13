import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Clock, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAllArticles } from "@/data/articles";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import PublicNav from "@/components/PublicNav";

const Insights = () => {
  const allArticles = useMemo(() => {
    return [...getAllArticles()].sort((a, b) =>
      (b.publishedDate ?? "").localeCompare(a.publishedDate ?? "")
    );
  }, []);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const categories = useMemo(() => {
    const cats = Array.from(new Set(allArticles.map((a) => a.category)));
    return cats.sort((a, b) => a.localeCompare(b));
  }, [allArticles]);

  const articles = useMemo(() => {
    let filtered = activeCategory
      ? allArticles.filter((a) => a.category === activeCategory)
      : allArticles;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.heroSubtitle ?? "").toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [allArticles, activeCategory, searchQuery]);

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <div className="pt-24 pb-16 max-w-5xl mx-auto px-6">
        <Link to="/">
          <Button variant="ghost" size="sm" className="mb-4 text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} className="mr-2" /> Back to Home
          </Button>
        </Link>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">Insights</h1>
          <p className="text-muted-foreground text-lg mb-10 max-w-2xl" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Expert articles on AI, conveyancing, compliance, and practice management — written for forward-thinking law firms.
          </p>
        </motion.div>

        {/* Search bar */}
        <div className="relative mb-6">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search articles…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9 h-10 bg-card border-border"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Category filter pills */}
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              !activeCategory
                ? "bg-accent text-accent-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Featured article (only when showing all) */}
        {!activeCategory && articles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="mb-10"
          >
            <Link to={`/insights/${articles[0].slug}`} className="block group">
              <div className="p-8 rounded-xl border border-border bg-card hover:border-accent/30 hover:shadow-lg transition-all duration-300">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">{articles[0].category} · Featured</span>
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground mt-3 mb-3 group-hover:text-accent transition-colors" style={{ fontFamily: "'Playfair Display', serif" }}>
                  {articles[0].title}
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-4 max-w-2xl" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {articles[0].heroSubtitle}
                </p>
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock size={12} /> {articles[0].readMinutes} min read
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-accent font-medium">
                    Read article <ArrowRight size={12} />
                  </span>
                </div>
              </div>
            </Link>
          </motion.div>
        )}

        {/* Article grid */}
        {articles.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No articles found in this category.</p>
        ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {(activeCategory ? articles : articles.slice(1)).map((article, i) => (
            <motion.div
              key={article.slug}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06, duration: 0.4 }}
            >
              <Link to={`/insights/${article.slug}`} className="block group h-full">
                <div className="p-5 rounded-xl border border-border bg-card hover:border-accent/30 hover:shadow-lg transition-all duration-300 h-full flex flex-col">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">{article.category}</span>
                  <h3 className="text-base font-semibold text-foreground mt-2 mb-2 group-hover:text-accent transition-colors leading-snug" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    {article.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed flex-1 line-clamp-3" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    {article.heroSubtitle}
                  </p>
                  <div className="flex items-center justify-between mt-4">
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock size={11} /> {article.readMinutes} min
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-accent font-medium">
                      Read <ArrowRight size={11} />
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
        )}

        {/* Bottom CTA */}
        <div className="mt-16 rounded-xl sentinel-gradient p-10 text-center relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Ready to Transform Your Practice?</h2>
            <p className="text-white/60 mb-6 max-w-lg mx-auto" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              See how Olimey AI's AI agents can save your firm time, reduce risk, and improve client experience.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/signup">
                <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 h-11">
                  Explore AI Agents <ArrowRight size={16} className="ml-2" />
                </Button>
              </Link>
              <Link to="/signup">
                <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10 h-11">
                  Create Free Account
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-10 border-t border-border">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-sm font-semibold tracking-tight">
            <span className="text-foreground">Lex</span>
            <span className="text-accent">Sentinel</span>
          </span>
          <div className="flex items-center gap-4">
            <Link to="/terms" className="text-xs text-muted-foreground hover:text-accent transition-colors">Terms & Conditions</Link>
            <Link to="/privacy" className="text-xs text-muted-foreground hover:text-accent transition-colors">Privacy Policy</Link>
            <p className="text-xs text-muted-foreground">© 2026 Olimey AI</p>
          </div>
        </div>
      </footer>

      <CookieConsentBanner />
    </div>
  );
};

export default Insights;
