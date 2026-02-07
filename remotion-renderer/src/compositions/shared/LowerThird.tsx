import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

export const LowerThird: React.FC<{
  title: string;
  subtitle?: string;
  accentColor: string;
  animateIn?: number;
}> = ({ title, subtitle, accentColor, animateIn = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const localFrame = Math.max(0, frame - animateIn);

  // Bar slides in from left
  const barSlide = spring({
    frame: localFrame,
    fps,
    config: { damping: 14, mass: 0.8 },
  });

  // Text fades in slightly after bar
  const textSlide = spring({
    frame: Math.max(0, localFrame - 4),
    fps,
    config: { damping: 12, mass: 0.6 },
  });

  const subtitleOpacity = interpolate(localFrame, [10, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const barWidth = interpolate(barSlide, [0, 1], [0, 100]);
  const textTranslateX = interpolate(textSlide, [0, 1], [-40, 0]);
  const textOpacity = textSlide;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 100,
        left: 0,
        right: 0,
        pointerEvents: "none",
      }}
    >
      {/* Accent bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 60,
          width: `${barWidth}%`,
          maxWidth: 600,
          height: 4,
          backgroundColor: accentColor,
          borderRadius: 2,
        }}
      />

      {/* Background panel */}
      <div
        style={{
          position: "absolute",
          bottom: 4,
          left: 60,
          width: `${barWidth}%`,
          maxWidth: 600,
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(12px)",
          padding: "16px 24px",
          borderRadius: "4px 4px 0 0",
        }}
      >
        {/* Title */}
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: "white",
            opacity: textOpacity,
            transform: `translateX(${textTranslateX}px)`,
            fontFamily: "system-ui, -apple-system, sans-serif",
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>

        {/* Subtitle */}
        {subtitle && (
          <div
            style={{
              fontSize: 20,
              color: accentColor,
              opacity: subtitleOpacity,
              marginTop: 4,
              fontFamily: "system-ui, -apple-system, sans-serif",
              lineHeight: 1.3,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
};
