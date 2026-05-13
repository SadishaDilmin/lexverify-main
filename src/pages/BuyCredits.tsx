import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Check, CreditCard, Loader2, Coins, ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/hooks/useCredits";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CREDIT_BUNDLES } from "@/data/creditPricing";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);

const BUNDLE_KEYS = ["starter", "professional", "firm", "enterprise"] as const;

const BuyCredits = () => {
  const { user } = useAuth();
  const { data: credits } = useCredits();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const handlePurchase = async (bundleKey: string) => {
    if (!user) {
      toast({ title: "Please sign in", description: "You need to be logged in to purchase credits.", variant: "destructive" });
      return;
    }

    setLoading(bundleKey);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { bundle: bundleKey },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not start checkout", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Buy Credits</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Purchase credit bundles to power your AI case reviews. Credits never expire.
          </p>
        </div>

        {credits && (
          <Card className="border-accent/20 bg-accent/5">
            <CardContent className="p-4 flex items-center gap-3">
              <Coins size={20} className="text-accent" />
              <div>
                <span className="text-lg font-bold text-foreground">{credits.balance}</span>
                <span className="text-sm text-muted-foreground ml-1.5">credits remaining</span>
              </div>
              {credits.is_free_trial && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent font-medium">
                  Free Trial
                </span>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CREDIT_BUNDLES.map((bundle, i) => {
            const bundleKey = BUNDLE_KEYS[i];
            const isPopular = i === 2;
            const isLoading = loading === bundleKey;

            return (
              <motion.div
                key={bundle.credits}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className={`border-border relative h-full flex flex-col ${isPopular ? "ring-2 ring-accent/40" : ""}`}>
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground text-xs font-bold px-3 py-0.5 rounded-full">
                      Most Popular
                    </div>
                  )}
                  <CardHeader className="pb-2 text-center">
                    <CardDescription className="text-xs font-semibold uppercase tracking-wider">
                      {bundle.label}
                    </CardDescription>
                    <CardTitle className="text-3xl font-bold text-foreground">
                      {fmt(bundle.price)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-center space-y-3 flex-1 flex flex-col">
                    <p className="text-sm text-muted-foreground">
                      {bundle.credits.toLocaleString()} credits
                    </p>
                    {bundle.discount > 0 && (
                      <p className="text-xs font-semibold text-accent">Save {bundle.discount}%</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {fmt(bundle.price / bundle.credits)}/credit
                    </p>
                    <Separator />
                    <ul className="text-xs text-muted-foreground space-y-1.5 text-left">
                      <li className="flex items-center gap-1.5">
                        <Check size={12} className="text-accent shrink-0" /> No expiry
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check size={12} className="text-accent shrink-0" /> No subscription
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check size={12} className="text-accent shrink-0" /> Instant top-up
                      </li>
                    </ul>
                    <div className="mt-auto pt-2">
                      <Button
                        onClick={() => handlePurchase(bundleKey)}
                        disabled={!!loading}
                        className={`w-full gap-2 ${isPopular ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""}`}
                        variant={isPopular ? "default" : "outline"}
                      >
                        {isLoading ? (
                          <><Loader2 size={14} className="animate-spin" /> Processing…</>
                        ) : (
                          <><ShoppingCart size={14} /> Buy Now</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        <Card className="border-border">
          <CardContent className="p-5 space-y-2">
            <p className="text-sm font-semibold text-foreground">How it works</p>
            <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>Choose a credit bundle above</li>
              <li>Complete payment securely via Stripe</li>
              <li>Credits are added to your account instantly</li>
              <li>Use credits to run AI reviews on your cases</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default BuyCredits;
