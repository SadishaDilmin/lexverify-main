import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";

const AI_DISCLAIMER_TEXT =
  "I confirm that AI-generated outputs within Olimey AI are provided solely as a professional assistance tool. They do not constitute legal advice. In accordance with my regulatory and professional obligations, I remain solely responsible for exercising independent legal judgement, reviewing, verifying, and approving all AI-generated content before it is relied upon, actioned, or communicated to any client, lender, or third party.";

interface AiDisclaimerDialogProps {
  open: boolean;
  onAccept: () => void;
}

const AiDisclaimerDialog = ({ open, onAccept }: AiDisclaimerDialogProps) => {
  const [accepted, setAccepted] = useState(false);

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-accent" />
            <DialogTitle>AI Usage Acknowledgement</DialogTitle>
          </div>
          <DialogDescription>
            Please review and accept the following before continuing.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border bg-muted/30 p-4 my-2">
          <div className="flex items-start gap-3">
            <Checkbox
              id="login-disclaimer"
              checked={accepted}
              onCheckedChange={(checked) => setAccepted(checked === true)}
              className="mt-0.5"
            />
            <Label htmlFor="login-disclaimer" className="text-sm leading-relaxed text-foreground cursor-pointer">
              {AI_DISCLAIMER_TEXT}
            </Label>
          </div>
        </div>
        <Button
          onClick={onAccept}
          disabled={!accepted}
          className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
        >
          Continue to Olimey AI
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default AiDisclaimerDialog;
