import { useRef, useEffect, useState } from "react";
import { X, Play, Pause, Volume2, VolumeX, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { formatSecondsToTimestamp } from "@/hooks/useClickableTimestamps";

interface LexMediaPlayerProps {
  fileUrl: string;
  fileType: "audio" | "video";
  seekTime: number;
  onClose: () => void;
}

const LexMediaPlayer = ({ fileUrl, fileType, seekTime, onClose }: LexMediaPlayerProps) => {
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  // Auto-seek and play when seekTime changes
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;

    const doSeek = () => {
      el.currentTime = seekTime;
      el.play().then(() => setPlaying(true)).catch(() => {});
    };

    if (el.readyState >= 1) {
      doSeek();
    } else {
      el.addEventListener("loadedmetadata", doSeek, { once: true });
    }
  }, [seekTime, fileUrl]);

  // Sync time updates
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    const onTime = () => setCurrentTime(el.currentTime);
    const onDur = () => setDuration(el.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onDur);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onDur);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
    };
  }, []);

  const togglePlay = () => {
    const el = mediaRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };

  const handleSliderChange = (val: number[]) => {
    const el = mediaRef.current;
    if (!el) return;
    el.currentTime = val[0];
    setCurrentTime(val[0]);
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          {fileType === "video" ? "🎬" : "🎧"} Media Evidence
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X size={14} />
        </Button>
      </div>

      {/* Player */}
      {fileType === "video" ? (
        <video
          ref={mediaRef}
          src={fileUrl}
          className="w-full rounded-lg bg-black aspect-video max-h-[300px]"
          muted={muted}
          playsInline
        />
      ) : (
        <audio ref={mediaRef} src={fileUrl} muted={muted} className="hidden" />
      )}

      {/* Audio Waveform Placeholder */}
      {fileType === "audio" && (
        <div className="w-full h-16 rounded-lg bg-muted/50 border border-border/40 flex items-center justify-center">
          <div className="flex items-center gap-1">
            {Array.from({ length: 32 }).map((_, i) => (
              <div
                key={i}
                className="w-1 bg-primary/40 rounded-full transition-all"
                style={{
                  height: `${Math.max(4, Math.sin((i + currentTime * 3) * 0.4) * 20 + 20)}px`,
                  opacity: playing ? 0.8 : 0.3,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={togglePlay}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </Button>

        <span className="text-[10px] text-muted-foreground font-mono w-[42px] shrink-0">
          {formatSecondsToTimestamp(currentTime)}
        </span>

        <Slider
          value={[currentTime]}
          max={duration || 1}
          step={0.5}
          onValueChange={handleSliderChange}
          className="flex-1"
        />

        <span className="text-[10px] text-muted-foreground font-mono w-[42px] shrink-0 text-right">
          {formatSecondsToTimestamp(duration)}
        </span>

        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setMuted(!muted)}>
          {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
        </Button>
      </div>
    </div>
  );
};

export default LexMediaPlayer;
