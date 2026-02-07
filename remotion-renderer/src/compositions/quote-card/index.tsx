import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { z } from "zod";
import { AnimatedBackground } from "../shared/AnimatedBackground.js";
import { ParticleField } from "../shared/ParticleField.js";
import { TextReveal } from "../shared/TextReveal.js";
import { GlowEffect } from "../shared/GlowEffect.js";

// --- Schema ---

export const quoteCardSchema = z.object({
  quoteText: z.string(),
  attribution: z.string(),
  subtitle: z.string().optional(),
  accentColor: z.string().default("#d97757"),
  backgroundColor: z.string().default("#141413"),
  brandName: z.string().optional(),
});

export type QuoteCardProps = z.infer<typeof quoteCardSchema>;

// --- Main Composition ---

export const QuoteCard: React.FC<QuoteCardProps> = ({
  quoteText,
  attribution,
  subtitle,
  accentColor,
  backgroundColor,
  brandName,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Accent line animates width 0 -> 300px
  const lineWidth = interpolate(frame, [60, 90], [0, 300], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Attribution fades in after quote has revealed
  const attributionOpacity = interpolate(frame, [80, 100], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtitle fades in after attribution
  const subtitleOpacity = interpolate(frame, [100, 115], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Brand name fades in at bottom
  const brandOpacity = interpolate(frame, [110, 125], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <AnimatedBackground color1={backgroundColor} color2={accentColor} variant="mesh" />
      <ParticleField color={accentColor} count={15} />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 80,
        }}
      >
        {/* Large quotation mark */}
        <GlowEffect color={accentColor} intensity={10}>
          <div
            style={{
              position: "absolute",
              top: 120,
              left: 100,
              fontSize: 140,
              fontWeight: 900,
              color: accentColor,
              opacity: 0.2,
              lineHeight: 1,
              fontFamily: "Georgia, serif",
            }}
          >
            {"\u201C"}
          </div>
        </GlowEffect>

        {/* Quote text */}
        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: "white",
            textAlign: "center",
            lineHeight: 1.4,
            maxWidth: "85%",
          }}
        >
          <TextReveal text={quoteText} mode="word" startFrame={5} staggerFrames={3} />
        </div>

        {/* Accent line */}
        <div
          style={{
            width: lineWidth,
            height: 3,
            backgroundColor: accentColor,
            borderRadius: 2,
            marginTop: 40,
            marginBottom: 30,
          }}
        />

        {/* Attribution */}
        <div
          style={{
            fontSize: 30,
            fontWeight: 600,
            color: accentColor,
            opacity: attributionOpacity,
          }}
        >
          {`\u2014 ${attribution}`}
        </div>

        {/* Subtitle */}
        {subtitle && (
          <div
            style={{
              fontSize: 22,
              color: "rgba(255,255,255,0.5)",
              marginTop: 12,
              opacity: subtitleOpacity,
            }}
          >
            {subtitle}
          </div>
        )}
      </AbsoluteFill>

      {/* Brand name at bottom */}
      {brandName && (
        <div
          style={{
            position: "absolute",
            bottom: 50,
            width: "100%",
            textAlign: "center",
            fontSize: 18,
            color: "rgba(255,255,255,0.3)",
            opacity: brandOpacity,
            letterSpacing: 2,
          }}
        >
          {brandName}
        </div>
      )}
    </AbsoluteFill>
  );
};
