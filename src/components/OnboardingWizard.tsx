import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, FolderPlus, Upload, Brain, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ONBOARDING_KEY = "ls-onboarding-complete";

interface Step {
  icon: React.ElementType;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    icon: FolderPlus,
    title: "Create a case",
    description: "Start by creating a new case with the property address, case reference, and transaction type.",
  },
  {
    icon: Upload,
    title: "Upload documents",
    description: "Upload title documents, searches, and contracts. We support PDF, DOCX, images, and more — up to 100MB per file.",
  },
  {
    icon: Brain,
    title: "AI analysis",
    description: "Our AI agents review your documents, flag risks, check compliance, and generate detailed reports — all in seconds.",
  },
  {
    icon: ShieldCheck,
    title: "Review & act",
    description: "Review AI findings with evidence citations, export reports, raise enquiries, and track everything in your audit trail.",
  },
];

/**
 * First-run onboarding wizard shown once per user.
 * Dismissed permanently via localStorage.
 */
export default function OnboardingWizard() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const done = localStorage.getItem(ONBOARDING_KEY);
    if (!done) setVisible(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setVisible(false);
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else dismiss();
  };

  if (!visible) return null;

  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={dismiss}
          />

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-4 bottom-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-50 w-auto sm:w-[440px] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
          >
            {/* Close */}
            <button
              onClick={dismiss}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-muted/50 transition-colors z-10"
            >
              <X size={16} className="text-muted-foreground" />
            </button>

            {/* Content */}
            <div className="px-6 pt-8 pb-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.25 }}
                  className="flex flex-col items-center text-center"
                >
                  <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mb-5">
                    <Icon size={26} className="text-accent" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{current.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
                    {current.description}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 flex items-center justify-between">
              {/* Step dots */}
              <div className="flex gap-1.5">
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      i === step ? "w-6 bg-accent" : "w-1.5 bg-muted-foreground/20"
                    )}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                {step > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
                    Back
                  </Button>
                )}
                <Button size="sm" onClick={next} className="gap-1.5">
                  {step === STEPS.length - 1 ? "Get started" : "Next"}
                  <ArrowRight size={14} />
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
