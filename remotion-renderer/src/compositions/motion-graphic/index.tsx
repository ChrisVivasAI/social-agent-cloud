import React from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { z } from "zod";
import { AnimatedCaption } from "../shared/AnimatedCaption.js";

const timedCaptionSchema = z.object({
  word: z.string(),
  startFrame: z.number(),
  endFrame: z.number(),
});

export const motionGraphicSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  backgroundColor: z.string().default("#1a1a2e"),
  accentColor: z.string().default("#e94560"),
  captions: z.array(timedCaptionSchema).optional(),
  showCaptions: z.boolean().default(true),
});

type MotionGraphicProps = z.infer<typeof motionGraphicSchema>;

export const MotionGraphic: React.FC<MotionGraphicProps> = ({
  title,
  subtitle,
  backgroundColor,
  accentColor,
  captions,
  showCaptions,
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

      {/* Auto-generated captions overlay */}
      {showCaptions && captions && captions.length > 0 && (() => {
        const segmentSize = 6;
        const segments: Array<{ text: string; startFrame: number; endFrame: number }> = [];
        for (let j = 0; j < captions.length; j += segmentSize) {
          const chunk = captions.slice(j, j + segmentSize);
          segments.push({
            text: chunk.map((c) => c.word).join(" "),
            startFrame: chunk[0].startFrame,
            endFrame: chunk[chunk.length - 1].endFrame,
          });
        }
        return segments.map((seg, idx) => (
          <Sequence
            key={`caption-${idx}`}
            from={seg.startFrame}
            durationInFrames={seg.endFrame - seg.startFrame}
          >
            <AbsoluteFill
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                paddingBottom: 80,
              }}
            >
              <div style={{
                backgroundColor: "rgba(0,0,0,0.6)",
                borderRadius: 8,
                padding: "12px 24px",
                maxWidth: "85%",
              }}>
                <AnimatedCaption
                  text={seg.text}
                  startFrame={0}
                  endFrame={seg.endFrame - seg.startFrame}
                  fontSize={36}
                  color={accentColor}
                  style="pop"
                />
              </div>
            </AbsoluteFill>
          </Sequence>
        ));
      })()}
    </AbsoluteFill>
  );
};
