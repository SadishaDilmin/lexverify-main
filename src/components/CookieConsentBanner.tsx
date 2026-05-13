import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";

const COOKIE_CONSENT_KEY = "olimey_cookie_consent";

const CookieConsentBanner = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    setVisible(false);
  };

  const handleDecline = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "declined");
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6"
        >
          <div className="max-w-4xl mx-auto rounded-xl border border-border bg-card shadow-2xl p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="hidden sm:flex w-10 h-10 rounded-lg bg-accent/10 items-center justify-center flex-shrink-0 mt-0.5">
                <Cookie size={20} className="text-accent" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">Cookie Notice</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    This site uses essential cookies strictly necessary for authentication and session management. We do not use advertising, tracking, or analytics cookies. By continuing to use Olimey AI, you consent to our use of essential cookies. For more information, please see our{" "}
                    <Link to="/privacy" className="text-accent hover:underline font-medium">Privacy Policy</Link>.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    size="sm"
                    onClick={handleAccept}
                    className="bg-accent text-accent-foreground hover:bg-accent/90 text-xs h-8 px-5"
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDecline}
                    className="text-xs h-8 px-5"
                  >
                    Essential Only
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CookieConsentBanner;
