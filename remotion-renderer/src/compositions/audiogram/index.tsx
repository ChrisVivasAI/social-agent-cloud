import React from "react";
import {
  AbsoluteFill,
  Audio,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  random,
} from "remotion";
import { z } from "zod";
import { AnimatedBackground } from "../shared/AnimatedBackground.js";
import { GlowEffect } from "../shared/GlowEffect.js";

// --- Schema ---

export const audiogramSchema = z.object({
  title: z.string(),
  captionText: z.string(),
  voiceoverUrl: z.string(),
  durationInFrames: z.number(),
  accentColor: z.string().default("#d97757"),
  backgroundColor: z.string().default("#141413"),
  brandName: z.string().optional(),
  waveformSeed: z.number().optional(),
});

export type AudiogramProps = z.infer<typeof audiogramSchema>;

// --- Waveform Component ---

const WAVEFORM_BARS = 40;
const WAVEFORM_HEIGHT = 200;

const Waveform: React.FC<{
  accentColor: string;
  seed: number;
}> = ({ accentColor, seed }) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        height: WAVEFORM_HEIGHT,
      }}
    >
      {Array.from({ length: WAVEFORM_BARS }).map((_, i) => {
        const baseHeight = random(`bar-${seed}-${i}`) * 0.6 + 0.2;
        const phase = random(`phase-${seed}-${i}`) * Math.PI * 2;
        const animated = Math.sin(frame * 0.15 + phase) * 0.3 + 0.7;
        const height = baseHeight * animated * WAVEFORM_HEIGHT;

        return (
          <div
            key={i}
            style={{
              width: 10,
              height: Math.max(4, height),
              backgroundColor: accentColor,
              borderRadius: 5,
              opacity: 0.7 + baseHeight * 0.3,
            }}
          />
        );
      })}
    </div>
  );
};

// --- Animated Captions Component ---

const WORDS_WINDOW = 6;

const AnimatedCaptions: React.FC<{
  captionText: string;
  accentColor: string;
}> = ({ captionText, accentColor }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const words = captionText.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  // Progress through the text proportional to total duration
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: "clamp",
  });

  const currentWordIndex = Math.min(
    Math.floor(progress * words.length),
    words.length - 1,
  );

  // Sliding window of words around the current word
  const windowStart = Math.max(0, currentWordIndex - Math.floor(WORDS_WINDOW / 2));
  const windowEnd = Math.min(words.length, windowStart + WORDS_WINDOW);
  const visibleWords = words.slice(windowStart, windowEnd);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 10,
        maxWidth: "85%",
        margin: "0 auto",
      }}
    >
      {visibleWords.map((word, i) => {
        const globalIndex = windowStart + i;
        const isCurrent = globalIndex === currentWordIndex;

        return (
          <span
            key={`${globalIndex}-${word}`}
            style={{
              fontSize: 36,
              fontWeight: isCurrent ? 800 : 500,
              color: isCurrent ? accentColor : "rgba(255,255,255,0.6)",
              transition: "color 0.1s, font-weight 0.1s",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

// --- Main Composition ---

export const AudiogramVideo: React.FC<AudiogramProps> = ({
  title,
  captionText,
  voiceoverUrl,
  durationInFrames,
  accentColor,
  backgroundColor,
  brandName,
  waveformSeed,
}) => {
  const frame = useCurrentFrame();
  const config = useVideoConfig();

  const seed = waveformSeed ?? 42;

  // Title fade-in
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Progress bar
  const progressWidth = interpolate(frame, [0, config.durationInFrames], [0, 100], {
    extrapolateRight: "clamp",
  });

  // Brand fade-in
  const brandOpacity = interpolate(frame, [10, 25], [0, 1], {
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
      <Audio src={voiceoverUrl} />
      <AnimatedBackground color1={backgroundColor} color2={accentColor} variant="mesh" />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 60,
        }}
      >
        {/* Title */}
        <GlowEffect color={accentColor} intensity={15}>
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: accentColor,
              textAlign: "center",
              marginBottom: 60,
              opacity: titleOpacity,
              maxWidth: "90%",
            }}
          >
            {title}
          </div>
        </GlowEffect>

        {/* Waveform */}
        <Waveform accentColor={accentColor} seed={seed} />

        {/* Animated captions */}
        <div style={{ marginTop: 60 }}>
          <AnimatedCaptions captionText={captionText} accentColor={accentColor} />
        </div>
      </AbsoluteFill>

      {/* Brand at bottom */}
      {brandName && (
        <div
          style={{
            position: "absolute",
            bottom: 30,
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

      {/* Progress bar at very bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: `${progressWidth}%`,
          height: 3,
          backgroundColor: accentColor,
        }}
      />
    </AbsoluteFill>
  );
};

// --- Calculate metadata (dynamic duration from prop) ---

export const calculateAudiogramMetadata = ({
  props,
}: {
  props: AudiogramProps;
}) => {
  return {
    durationInFrames: props.durationInFrames || 300,
    fps: 30,
    width: 1080,
    height: 1080,
  };
};
