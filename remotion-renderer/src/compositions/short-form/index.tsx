import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { z } from "zod";
import { AnimatedBackground } from "../shared/AnimatedBackground.js";
import { GlowEffect } from "../shared/GlowEffect.js";
import { AnimatedCaption } from "../shared/AnimatedCaption.js";

// --- Schema ---

const captionSegmentSchema = z.object({
  text: z.string(),
  startFrame: z.number(),
  endFrame: z.number(),
});

export const shortFormVideoSchema = z.object({
  title: z.string(),
  captionSegments: z.array(captionSegmentSchema),
  mediaUrl: z.string().optional(),
  voiceoverUrl: z.string().optional(),
  accentColor: z.string().default("#d97757"),
  backgroundColor: z.string().default("#141413"),
  brandName: z.string().default(""),
});

export type ShortFormVideoProps = z.infer<typeof shortFormVideoSchema>;

// --- Background Media Layer ---

const MediaBackground: React.FC<{
  mediaUrl: string;
  backgroundColor: string;
}> = ({ mediaUrl, backgroundColor }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Subtle Ken Burns
  const zoom = interpolate(frame, [0, durationInFrames], [1.0, 1.08], {
    extrapolateRight: "clamp",
  });

  return (
    <>
      <AbsoluteFill style={{ overflow: "hidden", backgroundColor }}>
        <Img
          src={mediaUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${zoom})`,
          }}
        />
      </AbsoluteFill>
      {/* Vignette overlay */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)",
        }}
      />
      {/* Bottom gradient for caption readability */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.5) 75%, rgba(0,0,0,0.8) 100%)",
        }}
      />
    </>
  );
};

// --- Title Intro ---

const TitleIntro: React.FC<{
  title: string;
  accentColor: string;
}> = ({ title, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleScale = spring({
    frame,
    fps,
    config: { damping: 10, mass: 0.6, stiffness: 150 },
  });

  const fadeOut = interpolate(frame, [50, 65], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 60,
        opacity: fadeOut,
      }}
    >
      <GlowEffect color={accentColor} intensity={15}>
        <div
          style={{
            fontSize: 56,
            fontWeight: 900,
            color: "white",
            textAlign: "center",
            lineHeight: 1.2,
            maxWidth: "90%",
            transform: `scale(${titleScale})`,
            textShadow: "0 4px 30px rgba(0,0,0,0.8)",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {title}
        </div>
      </GlowEffect>
    </AbsoluteFill>
  );
};

// --- Brand Watermark ---

const BrandWatermark: React.FC<{
  brandName: string;
  accentColor: string;
}> = ({ brandName, accentColor }) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [15, 25], [0, 0.6], {
    extrapolateRight: "clamp",
  });

  if (!brandName) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 60,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        opacity,
      }}
    >
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: "white",
          letterSpacing: 3,
          textTransform: "uppercase",
          padding: "8px 20px",
          backgroundColor: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(8px)",
          borderRadius: 20,
          border: `1px solid ${accentColor}44`,
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {brandName}
      </div>
    </div>
  );
};

// --- Progress Dots ---

const ProgressDots: React.FC<{
  segments: Array<{ startFrame: number; endFrame: number }>;
  accentColor: string;
}> = ({ segments, accentColor }) => {
  const frame = useCurrentFrame();

  if (segments.length <= 1) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 110,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        gap: 6,
      }}
    >
      {segments.map((seg, i) => {
        const isActive = frame >= seg.startFrame && frame < seg.endFrame;
        const isPast = frame >= seg.endFrame;

        return (
          <div
            key={i}
            style={{
              width: isActive ? 24 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: isActive
                ? accentColor
                : isPast
                  ? "rgba(255,255,255,0.5)"
                  : "rgba(255,255,255,0.2)",
              transition: "width 0.2s",
            }}
          />
        );
      })}
    </div>
  );
};

// --- Main Composition ---

export const ShortFormVideo: React.FC<ShortFormVideoProps> = ({
  title,
  captionSegments,
  mediaUrl,
  voiceoverUrl,
  accentColor,
  backgroundColor,
  brandName,
}) => {
  const frame = useCurrentFrame();

  // Determine if we should show title intro (first 70 frames)
  const showTitle = title && frame < 70;

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Background media or animated background */}
      {mediaUrl ? (
        <MediaBackground mediaUrl={mediaUrl} backgroundColor={backgroundColor} />
      ) : (
        <AnimatedBackground
          color1={backgroundColor}
          color2={accentColor}
          variant="mesh"
        />
      )}

      {/* Optional voiceover audio */}
      {voiceoverUrl && <Audio src={voiceoverUrl} />}

      {/* Brand watermark */}
      <BrandWatermark brandName={brandName} accentColor={accentColor} />

      {/* Progress dots */}
      <ProgressDots segments={captionSegments} accentColor={accentColor} />

      {/* Title intro overlay */}
      {showTitle && (
        <Sequence from={0} durationInFrames={70}>
          <TitleIntro title={title} accentColor={accentColor} />
        </Sequence>
      )}

      {/* Caption segments in bottom third */}
      {captionSegments.map((segment, i) => {
        const segDuration = segment.endFrame - segment.startFrame;
        return (
          <Sequence
            key={i}
            from={segment.startFrame}
            durationInFrames={segDuration}
          >
            <AbsoluteFill
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                paddingBottom: 200,
              }}
            >
              <AnimatedCaption
                text={segment.text}
                startFrame={0}
                endFrame={segDuration}
                fontSize={58}
                color={accentColor}
                style="pop"
              />
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* Bottom safe area accent bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 3,
          backgroundColor: accentColor,
          opacity: 0.4,
        }}
      />
    </AbsoluteFill>
  );
};

// --- Calculate metadata (dynamic duration) ---

export const calculateShortFormMetadata = ({
  props,
}: {
  props: ShortFormVideoProps;
}) => {
  // Duration is the max endFrame across all caption segments
  const lastFrame = props.captionSegments.reduce(
    (max, seg) => Math.max(max, seg.endFrame),
    0,
  );
  return {
    durationInFrames: lastFrame || 300,
    fps: 30,
    width: 1080,
    height: 1920,
  };
};
