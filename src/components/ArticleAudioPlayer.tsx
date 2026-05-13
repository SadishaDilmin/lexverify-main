import { useState, useRef, useEffect, useCallback } from "react";
import { Headphones, Play, Pause, Loader2, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

interface ArticleAudioPlayerProps {
  title: string;
  body: string;
  slug?: string;
}

const SPEED_OPTIONS = [1, 1.25, 1.5];

const ArticleAudioPlayer = ({ title, body, slug }: ArticleAudioPlayerProps) => {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [showVolumeControl, setShowVolumeControl] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const animRef = useRef<number>(0);

  const updateProgress = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      setCurrentTime(audio.currentTime);
      setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
      animRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  const setupAudio = (url: string) => {
    const audio = new Audio(url);
    audio.volume = volume;
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration);
      setStatus("ready");
      audio.play();
      setIsPlaying(true);
    });

    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      setProgress(100);
      cancelAnimationFrame(animRef.current);
    });

    audio.addEventListener("play", () => {
      animRef.current = requestAnimationFrame(updateProgress);
    });

    audio.addEventListener("pause", () => {
      cancelAnimationFrame(animRef.current);
    });
  };

  const generateAudio = async () => {
    if (blobUrlRef.current) {
      if (audioRef.current) audioRef.current.volume = volume;
      audioRef.current?.play();
      setIsPlaying(true);
      return;
    }

    setStatus("loading");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/article-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text: `${title}\n\n${body}`, slug }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "TTS failed" }));
        throw new Error(err.error || `TTS failed (${response.status})`);
      }

      const contentType = response.headers.get("Content-Type") || "";

      if (contentType.includes("application/json")) {
        // Cached URL returned
        const data = await response.json();
        if (data.cachedUrl) {
          blobUrlRef.current = data.cachedUrl;
          setupAudio(data.cachedUrl);
          return;
        }
      }

      // Fresh audio bytes
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      setupAudio(url);
    } catch (e) {
      console.error("TTS error:", e);
      setStatus("error");
      toast.error(e instanceof Error ? e.message : "Failed to generate audio");
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (val: number[]) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const newTime = (val[0] / 100) * audio.duration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
    setProgress(val[0]);
  };

  const cycleSpeed = () => {
    const idx = SPEED_OPTIONS.indexOf(speed);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      // Only revoke blob URLs, not cached public URLs
      if (blobUrlRef.current && blobUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      audioRef.current?.pause();
    };
  }, []);

  if (status === "idle" || status === "error") {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={generateAudio}
        className="gap-1.5 text-xs border-border hover:border-accent/30"
      >
        <Headphones size={14} />
        {status === "error" ? "Retry Listen" : "Listen"}
      </Button>
    );
  }

  if (status === "loading") {
    return (
      <Button variant="outline" size="sm" disabled className="gap-1.5 text-xs">
        <Loader2 size={14} className="animate-spin" />
        Generating audio…
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 w-full max-w-md">
      <button
        onClick={togglePlay}
        className="shrink-0 w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center hover:bg-accent/90 transition-colors"
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
      </button>

      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
        <Slider
          value={[progress]}
          onValueChange={handleSeek}
          max={100}
          step={0.1}
          className="cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <button
        onClick={cycleSpeed}
        className="shrink-0 text-[10px] font-semibold text-muted-foreground hover:text-foreground bg-secondary rounded px-1.5 py-0.5 transition-colors"
        aria-label="Playback speed"
      >
        {speed}x
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setShowVolumeControl((prev) => !prev)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Volume"
          aria-expanded={showVolumeControl}
        >
          {volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>

        {showVolumeControl && (
          <div className="absolute right-0 bottom-full mb-2 w-28 rounded-md border border-border bg-popover p-2 shadow-md z-20">
            <Slider
              value={[volume * 100]}
              onValueChange={([v]) => {
                const newVol = v / 100;
                setVolume(newVol);
                if (audioRef.current) audioRef.current.volume = newVol;
              }}
              max={100}
              step={1}
              className="cursor-pointer"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ArticleAudioPlayer;
