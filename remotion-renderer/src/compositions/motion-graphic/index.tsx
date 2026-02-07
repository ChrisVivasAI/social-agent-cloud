import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { z } from "zod";

export const motionGraphicSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  backgroundColor: z.string().default("#1a1a2e"),
  accentColor: z.string().default("#e94560"),
});

type MotionGraphicProps = z.infer<typeof motionGraphicSchema>;

export const MotionGraphic: React.FC<MotionGraphicProps> = ({
  title,
  subtitle,
  backgroundColor,
  accentColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({ frame, fps, config: { damping: 12 } });
  const subtitleOpacity = interpolate(frame, [30, 50], [0, 1], {
    extrapolateRight: "clamp",
  });
  const lineWidth = interpolate(frame, [15, 45], [0, 600], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Accent line */}
      <div
        style={{
          width: lineWidth,
          height: 4,
          backgroundColor: accentColor,
          marginBottom: 40,
          borderRadius: 2,
        }}
      />

      {/* Title */}
      <h1
        style={{
          color: "white",
          fontSize: 72,
          fontWeight: 800,
          textAlign: "center",
          maxWidth: "80%",
          lineHeight: 1.2,
          transform: `translateY(${interpolate(titleSpring, [0, 1], [50, 0])}px)`,
          opacity: titleSpring,
        }}
      >
        {title}
      </h1>

      {/* Subtitle */}
      {subtitle && (
        <p
          style={{
            color: accentColor,
            fontSize: 36,
            fontWeight: 400,
            marginTop: 20,
            opacity: subtitleOpacity,
            textAlign: "center",
            maxWidth: "70%",
          }}
        >
          {subtitle}
        </p>
      )}
    </AbsoluteFill>
  );
};
