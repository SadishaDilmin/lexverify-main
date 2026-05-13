import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, XCircle, ArrowRight, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const creditsParam = searchParams.get("credits");
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [result, setResult] = useState<{ credits_added: number; new_balance: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      setErrorMsg("No session ID found.");
      return;
    }

    const verify = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("verify-payment", {
          body: { session_id: sessionId },
        });

        if (error) throw error;
        if (data?.success) {
          setResult({ credits_added: data.credits_added, new_balance: data.new_balance });
          setStatus("success");
          queryClient.invalidateQueries({ queryKey: ["user-credits"] });
        } else {
          throw new Error(data?.error || "Verification failed");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Could not verify payment");
        setStatus("error");
      }
    };

    verify();
  }, [sessionId, queryClient]);

  return (
    <AppLayout>
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full border-border">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            {status === "verifying" && (
              <>
                <Loader2 size={40} className="animate-spin text-accent mx-auto" />
                <h2 className="text-xl font-bold text-foreground">Verifying payment…</h2>
                <p className="text-sm text-muted-foreground">Please wait while we confirm your purchase.</p>
              </>
            )}

            {status === "success" && result && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="space-y-4"
              >
                <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={32} className="text-accent" />
                </div>
                <h2 className="text-2xl font-bold text-foreground">Payment successful!</h2>
                <p className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{result.credits_added}</span> credits
                  have been added to your account.
                </p>
                <div className="flex items-center justify-center gap-2 text-sm">
                  <Coins size={16} className="text-accent" />
                  <span className="font-semibold text-foreground">New balance: {result.new_balance} credits</span>
                </div>
                <div className="flex flex-col gap-2 pt-2">
                  <Link to="/dashboard">
                    <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
                      Go to Dashboard <ArrowRight size={14} />
                    </Button>
                  </Link>
                  <Link to="/buy-credits">
                    <Button variant="outline" className="w-full">Buy More Credits</Button>
                  </Link>
                </div>
              </motion.div>
            )}

            {status === "error" && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="space-y-4"
              >
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                  <XCircle size={32} className="text-destructive" />
                </div>
                <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
                <p className="text-sm text-muted-foreground">{errorMsg}</p>
                <div className="flex flex-col gap-2 pt-2">
                  <Link to="/buy-credits">
                    <Button variant="outline" className="w-full">Try Again</Button>
                  </Link>
                  <Link to="/dashboard">
                    <Button variant="ghost" className="w-full">Back to Dashboard</Button>
                  </Link>
                </div>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default PaymentSuccess;
