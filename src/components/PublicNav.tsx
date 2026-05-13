import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Gift, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import OlimeyLogo from "@/components/LexSentinelLogo";

const links = [
  { to: "/insights", label: "Insights" },
  { to: "/glossary", label: "Glossary" },
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About Us" },
];

const PublicNav = () => {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 w-full z-50 glass">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center">
          <OlimeyLogo size="md" variant="full" />
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-3">
          {links.map((l) => (
            <Link key={l.to} to={l.to}>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "text-muted-foreground hover:text-foreground",
                  location.pathname.startsWith(l.to) && "text-foreground font-semibold"
                )}
              >
                {l.label}
              </Button>
            </Link>
          ))}
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <Link to="/login">Sign In</Link>
          </Button>
          <Button asChild size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 gap-1.5">
            <Link to="/signup">
              <Gift size={14} /> Start Free — 100 Credits
            </Link>
          </Button>
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden text-foreground" onClick={() => setOpen(!open)}>
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-border/30 bg-background/95 backdrop-blur-md px-6 py-4 space-y-2">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className={cn(
                "block px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                location.pathname.startsWith(l.to)
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {l.label}
            </Link>
          ))}
          <Link to="/login" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            Sign In
          </Link>
          <Button asChild size="sm" className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-1.5 mt-2">
            <Link to="/signup" onClick={() => setOpen(false)}>
              <Gift size={14} /> Start Free — 100 Credits
            </Link>
          </Button>
        </div>
      )}
    </nav>
  );
};

export default PublicNav;
