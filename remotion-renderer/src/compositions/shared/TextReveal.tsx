import React from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";

type Mode = "word" | "char";

export const TextReveal: React.FC<{
  text: string;
  mode?: Mode;
  startFrame?: number;
  staggerFrames?: number;
  style?: React.CSSProperties;
}> = ({ text, mode = "word", startFrame = 0, staggerFrames = 3, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const units = mode === "word" ? text.split(/(\s+)/) : text.split("");

  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", justifyContent: "center", ...style }}>
      {units.map((unit, i) => {
        // Skip pure whitespace tokens for stagger counting but still render them
        const isWhitespace = /^\s+$/.test(unit);
        if (isWhitespace) {
          return (
            <span key={i} style={{ whiteSpace: "pre" }}>
              {unit}
            </span>
          );
        }

        // Count only non-whitespace tokens for stagger delay
        const visibleIndex = units.slice(0, i).filter((u) => !/^\s+$/.test(u)).length;
        const delay = startFrame + visibleIndex * staggerFrames;
        const localFrame = Math.max(0, frame - delay);

        const s = spring({
          frame: localFrame,
          fps,
          config: { damping: 14, mass: 0.8 },
        });

        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: s,
              transform: `translateY(${(1 - s) * 20}px)`,
            }}
          >
            {unit}
          </span>
        );
      })}
    </span>
  );
};
