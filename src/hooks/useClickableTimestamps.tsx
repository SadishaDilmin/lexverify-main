import React, { useCallback, useMemo } from "react";

/**
 * Parses text for timestamps (HH:MM:SS, MM:SS, [MM:SS], [HH:MM:SS])
 * and replaces them with clickable elements that fire an onSeek callback.
 */

const TIMESTAMP_REGEX = /\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?/g;

/** Convert "MM:SS" or "HH:MM:SS" to total seconds */
export function parseTimestampToSeconds(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

/** Format seconds back to MM:SS or HH:MM:SS */
export function formatSecondsToTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

interface UseClickableTimestampsOptions {
  onSeek: (seconds: number) => void;
}

/**
 * Returns a function that takes a string and produces React nodes,
 * replacing timestamps with clickable buttons.
 */
export function useClickableTimestamps({ onSeek }: UseClickableTimestampsOptions) {
  const renderWithTimestamps = useCallback(
    (text: string): React.ReactNode[] => {
      const nodes: React.ReactNode[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      const regex = new RegExp(TIMESTAMP_REGEX.source, "g");

      while ((match = regex.exec(text)) !== null) {
        // Text before the match
        if (match.index > lastIndex) {
          nodes.push(text.slice(lastIndex, match.index));
        }

        const rawTimestamp = match[1]; // captured group without brackets
        const seconds = parseTimestampToSeconds(rawTimestamp);

        nodes.push(
          <button
            key={`ts-${match.index}`}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSeek(seconds);
            }}
            className="inline-flex items-center gap-0.5 text-primary hover:text-primary/80 hover:underline font-medium text-[11px] mx-0.5 transition-colors"
            title={`Jump to ${rawTimestamp}`}
          >
            ▶ {rawTimestamp}
          </button>
        );

        lastIndex = match.index + match[0].length;
      }

      // Trailing text
      if (lastIndex < text.length) {
        nodes.push(text.slice(lastIndex));
      }

      return nodes.length > 0 ? nodes : [text];
    },
    [onSeek]
  );

  return { renderWithTimestamps };
}
