import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Clock, Calendar, Tag, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getArticleBySlug, getRecommendedArticles, extractFaqsFromBody } from "@/data/articles";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import FreeTrialBanner from "@/components/FreeTrialBanner";
import PublicNav from "@/components/PublicNav";
import ArticleAudioPlayer from "@/components/ArticleAudioPlayer";
import ArticleDownloadButton from "@/components/ArticleDownloadButton";
import { useEffect } from "react";

/** Convert markdown-like body text to JSX with embedded links */
function renderBody(body: string) {
  // Split by paragraphs (double newline)
  const blocks = body.split(/\n\n+/);

  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;

    // Headings
    if (trimmed.startsWith("### ")) {
      return <h3 key={i} className="text-lg font-semibold text-foreground mt-8 mb-3" style={{ fontFamily: "'DM Sans', sans-serif" }}>{renderInline(trimmed.slice(4))}</h3>;
    }
    if (trimmed.startsWith("## ")) {
      return <h2 key={i} className="text-xl sm:text-2xl font-bold text-foreground mt-10 mb-4">{renderInline(trimmed.slice(3))}</h2>;
    }

    // Numbered list
    if (/^\d+\.\s/.test(trimmed)) {
      const items = trimmed.split(/\n/).filter((l) => l.trim());
      return (
        <ol key={i} className="list-decimal list-inside space-y-2 my-4 text-muted-foreground leading-relaxed" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          {items.map((item, j) => (
            <li key={j}>{renderInline(item.replace(/^\d+\.\s*/, ""))}</li>
          ))}
        </ol>
      );
    }

    // Bullet list
    if (trimmed.startsWith("- ")) {
      const items = trimmed.split(/\n/).filter((l) => l.trim());
      return (
        <ul key={i} className="list-disc list-inside space-y-2 my-4 text-muted-foreground leading-relaxed" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          {items.map((item, j) => (
            <li key={j}>{renderInline(item.replace(/^-\s*/, ""))}</li>
          ))}
        </ul>
      );
    }

    // Regular paragraph
    return (
      <p key={i} className="text-muted-foreground leading-relaxed my-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        {renderInline(trimmed)}
      </p>
    );
  });
}

/** Render inline markdown: bold (with optional nested link), standalone links */
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match bold (possibly containing a link), or standalone links
  const regex = /(\*\*(.+?)\*\*)|(\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Bold — check if inner content is a markdown link
      const inner = match[2];
      const linkMatch = inner.match(/^\[(.+?)\]\((.+?)\)$/);
      if (linkMatch) {
        const linkText = linkMatch[1];
        const href = linkMatch[2];
        const linkEl = href.startsWith("/") ? (
          <Link key={match.index} to={href} className="text-accent hover:text-accent/80 underline underline-offset-2 transition-colors font-semibold">{linkText}</Link>
        ) : (
          <a key={match.index} href={href} className="text-accent hover:text-accent/80 underline underline-offset-2 transition-colors font-semibold" target="_blank" rel="noopener noreferrer">{linkText}</a>
        );
        parts.push(linkEl);
      } else {
        parts.push(<strong key={match.index} className="text-foreground font-semibold">{inner}</strong>);
      }
    } else if (match[3]) {
      const linkText = match[4];
      const href = match[5];
      if (href.startsWith("/")) {
        parts.push(
          <Link key={match.index} to={href} className="text-accent hover:text-accent/80 underline underline-offset-2 transition-colors">{linkText}</Link>
        );
      } else {
        parts.push(
          <a key={match.index} href={href} className="text-accent hover:text-accent/80 underline underline-offset-2 transition-colors" target="_blank" rel="noopener noreferrer">{linkText}</a>
        );
      }
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

const ArticlePage = () => {
  const { slug } = useParams<{ slug: string }>();
  const article = slug ? getArticleBySlug(slug) : undefined;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (!article) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Article Not Found</h1>
          <Button asChild variant="outline">
            <Link to="/insights">Back to Insights</Link>
          </Button>
        </div>
      </div>
    );
  }

  const recommended = getRecommendedArticles(article.slug, 3);
  const faqs = article.faqs ?? extractFaqsFromBody(article.body);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": article.title,
    "description": article.metaDescription || article.heroSubtitle,
    "datePublished": article.publishedDate,
    "author": {
      "@type": "Organization",
      "name": "Olimey AI",
      "url": "https://olimey.ai/"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Olimey AI",
      "url": "https://olimey.ai/"
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://olimey.ai/insights/${article.slug}`
    },
    "articleSection": article.category,
    "wordCount": article.body.split(/\s+/).length
  };

  const faqJsonLd = faqs.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map((faq) => ({
      "@type": "Question",
      "name": faq.q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.a
      }
    }))
  } : null;

  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {faqJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />}
      <PublicNav />

      {/* Article Header */}
      <header className="pt-28 pb-12 border-b border-border">
        <div className="max-w-3xl mx-auto px-6">
          <Button asChild variant="ghost" size="sm" className="mb-6 text-muted-foreground hover:text-foreground">
            <Link to="/insights">
              <ArrowLeft size={16} className="mr-2" /> Back to Insights
            </Link>
          </Button>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent/10 px-2.5 py-1 rounded-full">
                <Tag size={12} /> {article.category}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock size={12} /> {article.readMinutes} min read
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar size={12} /> {new Date(article.publishedDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight mb-4">{article.title}</h1>
            <p className="text-lg text-muted-foreground leading-relaxed" style={{ fontFamily: "'DM Sans', sans-serif" }}>{article.heroSubtitle}</p>
            <div className="flex items-center gap-2 mt-5 flex-wrap">
              <ArticleAudioPlayer title={article.title} body={article.body} slug={article.slug} />
              <ArticleDownloadButton
                title={article.title}
                body={article.body}
                category={article.category}
                publishedDate={article.publishedDate}
                readMinutes={article.readMinutes}
              />
            </div>
          </motion.div>
        </div>
      </header>

      {/* Article Body */}
      <article className="py-12">
        <div className="max-w-3xl mx-auto px-6">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.5 }}>
            {renderBody(article.body)}
          </motion.div>

          {/* Free Trial CTA — mid-article conversion */}
          <div className="my-12 rounded-xl sentinel-gradient p-8 sm:p-10 relative overflow-hidden">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, hsl(22, 75%, 50%), transparent 50%)" }} />
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white/90 text-xs font-medium mb-4">
                <Gift size={12} /> 100 Free Credits · No Card Required
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Start Your Free Trial Today</h3>
              <p className="text-white/70 mb-6 max-w-lg" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                See how AI-powered search analysis transforms your conveyancing workflow. Get 100 free credits — enough for multiple full case reviews.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 h-11 gap-2">
                  <Link to="/free-trial">
                    <Gift size={16} /> Start Free Trial <ArrowRight size={16} />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </article>

      {/* Recommended Articles */}
      <section className="py-16 bg-card/50 border-y border-border">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-foreground mb-8">Continue Reading</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {recommended.map((rec, i) => (
              <motion.div
                key={rec.slug}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.4 }}
              >
                <Link to={`/insights/${rec.slug}`} className="block group">
                  <div className="p-5 rounded-xl border border-border bg-card hover:border-accent/30 hover:shadow-lg transition-all duration-300 h-full">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">{rec.category}</span>
                    <h3 className="text-base font-semibold text-foreground mt-2 mb-2 group-hover:text-accent transition-colors leading-snug" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                      {rec.title}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                      {rec.heroSubtitle}
                    </p>
                    <div className="flex items-center gap-1.5 mt-3 text-xs text-accent font-medium">
                      Read article <ArrowRight size={12} />
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Inline free trial banner */}
      <section className="py-10">
        <div className="max-w-3xl mx-auto px-6">
          <FreeTrialBanner variant="hero" />
        </div>
      </section>

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

export default ArticlePage;
