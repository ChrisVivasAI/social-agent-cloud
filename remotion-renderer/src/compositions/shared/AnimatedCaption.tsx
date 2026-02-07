import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

type CaptionStyle = "pop" | "fade" | "typewriter";

export const AnimatedCaption: React.FC<{
  text: string;
  startFrame: number;
  endFrame: number;
  fontSize?: number;
  color?: string;
  style?: CaptionStyle;
}> = ({
  text,
  startFrame,
  endFrame,
  fontSize = 64,
  color = "#FFFFFF",
  style: captionStyle = "pop",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const totalDuration = endFrame - startFrame;
  const framesPerWord = Math.max(1, Math.floor(totalDuration / words.length));

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        gap: fontSize * 0.25,
        padding: "0 40px",
      }}
    >
      {words.map((word, i) => {
        const wordStart = startFrame + i * framesPerWord;
        const localFrame = frame - wordStart;
        const isVisible = frame >= wordStart;

        if (!isVisible) {
          return (
            <span
              key={i}
              style={{
                fontSize,
                fontWeight: 800,
                color: "transparent",
                fontFamily: "system-ui, -apple-system, sans-serif",
              }}
            >
              {word}
            </span>
          );
        }

        // Highlight the current word
        const isCurrentWord =
          frame >= wordStart && frame < wordStart + framesPerWord;

        if (captionStyle === "pop") {
          const popScale = spring({
            frame: localFrame,
            fps,
            config: { damping: 8, mass: 0.4, stiffness: 200 },
          });

          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                fontSize,
                fontWeight: 800,
                color: isCurrentWord ? color : "rgba(255,255,255,0.6)",
                transform: `scale(${interpolate(popScale, [0, 1], [0.5, isCurrentWord ? 1.1 : 1])})`,
                opacity: popScale,
                fontFamily: "system-ui, -apple-system, sans-serif",
                textShadow: isCurrentWord
                  ? "0 2px 20px rgba(0,0,0,0.8), 0 0 40px rgba(0,0,0,0.4)"
                  : "0 2px 10px rgba(0,0,0,0.5)",
                transition: "color 0.1s",
              }}
            >
              {word}
            </span>
          );
        }

        if (captionStyle === "fade") {
          const fadeIn = interpolate(localFrame, [0, 6], [0, 1], {
            extrapolateRight: "clamp",
          });
          const translateY = interpolate(localFrame, [0, 6], [15, 0], {
            extrapolateRight: "clamp",
          });

          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                fontSize,
                fontWeight: 800,
                color: isCurrentWord ? color : "rgba(255,255,255,0.6)",
                opacity: fadeIn,
                transform: `translateY(${translateY}px)`,
                fontFamily: "system-ui, -apple-system, sans-serif",
                textShadow: "0 2px 20px rgba(0,0,0,0.8)",
              }}
            >
              {word}
            </span>
          );
        }

        // typewriter
        const typeOpacity = interpolate(localFrame, [0, 2], [0, 1], {
          extrapolateRight: "clamp",
        });

        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              fontSize,
              fontWeight: 800,
              color: isCurrentWord ? color : "rgba(255,255,255,0.6)",
              opacity: typeOpacity,
              fontFamily: "system-ui, -apple-system, sans-serif",
              textShadow: "0 2px 20px rgba(0,0,0,0.8)",
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
