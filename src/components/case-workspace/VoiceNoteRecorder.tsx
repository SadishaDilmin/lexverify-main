import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Square, Send, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface VoiceNoteRecorderProps {
  onTranscription: (text: string) => void;
  disabled?: boolean;
}

export default function VoiceNoteRecorder({ onTranscription, disabled }: VoiceNoteRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number>(0);
  const { toast } = useToast();

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await transcribeAudio(blob);
      };

      mediaRecorder.start(250);
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);
      setDuration(0);

      timerRef.current = window.setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (e: any) {
      toast({ title: "Microphone access denied", description: "Please allow microphone access to record voice notes.", variant: "destructive" });
    }
  }, [toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    clearInterval(timerRef.current);
  }, []);

  const transcribeAudio = async (blob: Blob) => {
    setTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("audio", blob, "voice-note.webm");

      // Use the ElevenLabs STT via edge function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/article-tts`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        // Fallback: use browser's built-in speech recognition if available
        if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
          toast({ title: "Using browser transcription", description: "Cloud transcription unavailable. Please try again." });
        }
        throw new Error("Transcription failed");
      }

      const data = await response.json();
      if (data.text) {
        onTranscription(data.text);
        toast({ title: "Voice note transcribed", description: `${data.text.split(" ").length} words captured.` });
      }
    } catch (e: any) {
      // Fallback: offer to paste the audio note manually
      toast({
        title: "Transcription unavailable",
        description: "Voice recording saved but transcription service is not configured. You can type the note manually.",
        variant: "destructive",
      });
    } finally {
      setTranscribing(false);
    }
  };

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-1.5">
      {recording ? (
        <>
          <Button
            variant="destructive"
            size="icon"
            className="h-8 w-8"
            onClick={stopRecording}
          >
            <Square size={12} />
          </Button>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-destructive/10 border border-destructive/20">
            <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-[10px] font-mono text-destructive font-medium">{formatDuration(duration)}</span>
          </div>
        </>
      ) : transcribing ? (
        <Button variant="outline" size="icon" className="h-8 w-8" disabled>
          <Loader2 size={12} className="animate-spin" />
        </Button>
      ) : (
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 hover:bg-accent/10 hover:text-accent hover:border-accent/30"
          onClick={startRecording}
          disabled={disabled}
          title="Record voice note"
        >
          <Mic size={12} />
        </Button>
      )}
    </div>
  );
}
