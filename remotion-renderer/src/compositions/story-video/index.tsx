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
import { SceneTransition } from "../shared/SceneTransition.js";
import { TextReveal } from "../shared/TextReveal.js";
import { GlowEffect } from "../shared/GlowEffect.js";
import { LowerThird } from "../shared/LowerThird.js";

// --- Schema ---

const storySceneSchema = z.object({
  type: z.enum([
    "full_bleed",
    "lower_third",
    "split_screen",
    "b_roll",
    "transition",
  ]),
  text: z.string(),
  subtext: z.string().optional(),
  durationInFrames: z.number(),
  imageUrl: z.string().optional(),
  videoUrl: z.string().optional(),
});

export const storyVideoSchema = z.object({
  title: z.string(),
  scenes: z.array(storySceneSchema),
  voiceoverUrl: z.string().optional(),
  brandName: z.string().default("Story"),
  accentColor: z.string().default("#d97757"),
  backgroundColor: z.string().default("#141413"),
});

export type StoryVideoProps = z.infer<typeof storyVideoSchema>;

// --- Scene Components ---

const FullBleedScene: React.FC<{
  text: string;
  subtext?: string;
  imageUrl?: string;
  accentColor: string;
  backgroundColor: string;
}> = ({ text, subtext, imageUrl, accentColor, backgroundColor }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Ken Burns zoom on background
  const zoom = interpolate(frame, [0, durationInFrames], [1.0, 1.12], {
    extrapolateRight: "clamp",
  });

  const textOpacity = interpolate(frame, [8, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  const subtextOpacity = interpolate(frame, [18, 30], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <SceneTransition>
      {imageUrl ? (
        <>
          <AbsoluteFill style={{ overflow: "hidden" }}>
            <Img
              src={imageUrl}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: `scale(${zoom})`,
              }}
            />
          </AbsoluteFill>
          {/* Dark overlay for text readability */}
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.7) 100%)",
            }}
          />
        </>
      ) : (
        <AnimatedBackground
          color1={backgroundColor}
          color2={accentColor}
          variant="mesh"
        />
      )}

      {/* Centered text overlay */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 60,
        }}
      >
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: "white",
            textAlign: "center",
            lineHeight: 1.3,
            maxWidth: "90%",
            opacity: textOpacity,
            textShadow: "0 2px 30px rgba(0,0,0,0.8)",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <TextReveal text={text} mode="word" startFrame={5} staggerFrames={3} />
        </div>

        {subtext && (
          <div
            style={{
              fontSize: 26,
              color: "rgba(255,255,255,0.7)",
              textAlign: "center",
              maxWidth: "80%",
              marginTop: 20,
              opacity: subtextOpacity,
              lineHeight: 1.5,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {subtext}
          </div>
        )}
      </AbsoluteFill>

      {/* Accent line at bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 3,
          backgroundColor: accentColor,
          opacity: 0.6,
        }}
      />
    </SceneTransition>
  );
};

const LowerThirdScene: React.FC<{
  text: string;
  subtext?: string;
  imageUrl?: string;
  accentColor: string;
  backgroundColor: string;
}> = ({ text, subtext, imageUrl, accentColor, backgroundColor }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const zoom = interpolate(frame, [0, durationInFrames], [1.0, 1.08], {
    extrapolateRight: "clamp",
  });

  return (
    <SceneTransition>
      {imageUrl ? (
        <>
          <AbsoluteFill style={{ overflow: "hidden" }}>
            <Img
              src={imageUrl}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: `scale(${zoom})`,
              }}
            />
          </AbsoluteFill>
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.6) 100%)",
            }}
          />
        </>
      ) : (
        <AnimatedBackground
          color1={backgroundColor}
          color2={accentColor}
        />
      )}

      <LowerThird
        title={text}
        subtitle={subtext}
        accentColor={accentColor}
        animateIn={6}
      />
    </SceneTransition>
  );
};

const SplitScreenScene: React.FC<{
  text: string;
  subtext?: string;
  imageUrl?: string;
  accentColor: string;
  backgroundColor: string;
}> = ({ text, subtext, imageUrl, accentColor, backgroundColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const leftSlide = spring({
    frame,
    fps,
    config: { damping: 14, mass: 0.8 },
  });

  const rightSlide = spring({
    frame: Math.max(0, frame - 4),
    fps,
    config: { damping: 14, mass: 0.8 },
  });

  const textOpacity = interpolate(frame, [12, 22], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Parse imageUrl as two images separated by |
  const images = imageUrl ? imageUrl.split("|").map((u) => u.trim()) : [];
  const leftImage = images[0];
  const rightImage = images[1] || images[0];

  return (
    <SceneTransition>
      <AnimatedBackground
        color1={backgroundColor}
        color2={accentColor}
      />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "row",
          padding: 40,
          gap: 20,
        }}
      >
        {/* Left panel */}
        <div
          style={{
            flex: 1,
            borderRadius: 12,
            overflow: "hidden",
            transform: `translateX(${interpolate(leftSlide, [0, 1], [-60, 0])}px)`,
            opacity: leftSlide,
          }}
        >
          {leftImage ? (
            <Img
              src={leftImage}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                backgroundColor: `${accentColor}22`,
                border: `2px solid ${accentColor}44`,
              }}
            />
          )}
        </div>

        {/* Right panel */}
        <div
          style={{
            flex: 1,
            borderRadius: 12,
            overflow: "hidden",
            transform: `translateX(${interpolate(rightSlide, [0, 1], [60, 0])}px)`,
            opacity: rightSlide,
          }}
        >
          {rightImage ? (
            <Img
              src={rightImage}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                backgroundColor: `${accentColor}22`,
                border: `2px solid ${accentColor}44`,
              }}
            />
          )}
        </div>
      </AbsoluteFill>

      {/* Text overlay at bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          left: 60,
          right: 60,
          textAlign: "center",
          opacity: textOpacity,
        }}
      >
        <div
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: "white",
            textShadow: "0 2px 20px rgba(0,0,0,0.8)",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {text}
        </div>
        {subtext && (
          <div
            style={{
              fontSize: 22,
              color: "rgba(255,255,255,0.6)",
              marginTop: 8,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {subtext}
          </div>
        )}
      </div>
    </SceneTransition>
  );
};

const BRollScene: React.FC<{
  text: string;
  subtext?: string;
  imageUrl?: string;
  accentColor: string;
  backgroundColor: string;
}> = ({ text, subtext, imageUrl, accentColor, backgroundColor }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Slow pan effect
  const panX = interpolate(frame, [0, durationInFrames], [0, -30], {
    extrapolateRight: "clamp",
  });
  const zoom = interpolate(frame, [0, durationInFrames], [1.1, 1.2], {
    extrapolateRight: "clamp",
  });

  const textOpacity = interpolate(frame, [10, 22], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <SceneTransition>
      {imageUrl ? (
        <>
          <AbsoluteFill style={{ overflow: "hidden" }}>
            <Img
              src={imageUrl}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: `scale(${zoom}) translateX(${panX}px)`,
              }}
            />
          </AbsoluteFill>
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 30%, rgba(0,0,0,0.6) 100%)",
            }}
          />
        </>
      ) : (
        <AnimatedBackground
          color1={backgroundColor}
          color2={accentColor}
          variant="diagonal"
        />
      )}

      {/* Text overlay */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 80,
          opacity: textOpacity,
        }}
      >
        <GlowEffect color={accentColor} intensity={10}>
          <div
            style={{
              fontSize: 44,
              fontWeight: 700,
              color: "white",
              textAlign: "center",
              lineHeight: 1.4,
              maxWidth: "85%",
              textShadow: "0 2px 30px rgba(0,0,0,0.8)",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            <TextReveal text={text} mode="word" startFrame={8} staggerFrames={3} />
          </div>
        </GlowEffect>

        {subtext && (
          <div
            style={{
              fontSize: 24,
              color: accentColor,
              textAlign: "center",
              marginTop: 16,
              fontFamily: "system-ui, -apple-system, sans-serif",
              textShadow: "0 2px 10px rgba(0,0,0,0.6)",
            }}
          >
            {subtext}
          </div>
        )}
      </AbsoluteFill>
    </SceneTransition>
  );
};

const TransitionScene: React.FC<{
  text: string;
  accentColor: string;
  backgroundColor: string;
}> = ({ text, accentColor, backgroundColor }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { damping: 12, mass: 0.6 },
  });

  const fadeOut = interpolate(
    frame,
    [durationInFrames - 10, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <SceneTransition>
      <AnimatedBackground
        color1={backgroundColor}
        color2={accentColor}
        variant="mesh"
      />

      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: fadeOut,
        }}
      >
        <GlowEffect color={accentColor} intensity={20}>
          <div
            style={{
              fontSize: 48,
              fontWeight: 800,
              color: "white",
              transform: `scale(${scale})`,
              textAlign: "center",
              maxWidth: "80%",
              lineHeight: 1.3,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {text}
          </div>
        </GlowEffect>
      </AbsoluteFill>
    </SceneTransition>
  );
};

// --- Main Composition ---

export const StoryVideo: React.FC<StoryVideoProps> = ({
  title,
  scenes,
  voiceoverUrl,
  brandName,
  accentColor,
  backgroundColor,
}) => {
  let frameOffset = 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Optional voiceover audio */}
      {voiceoverUrl && <Audio src={voiceoverUrl} />}

      {/* Render scenes as sequences */}
      {scenes.map((scene, i) => {
        const from = frameOffset;
        frameOffset += scene.durationInFrames;

        switch (scene.type) {
          case "full_bleed":
            return (
              <Sequence
                key={i}
                from={from}
                durationInFrames={scene.durationInFrames}
              >
                <FullBleedScene
                  text={scene.text}
                  subtext={scene.subtext}
                  imageUrl={scene.imageUrl}
                  accentColor={accentColor}
                  backgroundColor={backgroundColor}
                />
              </Sequence>
            );

          case "lower_third":
            return (
              <Sequence
                key={i}
                from={from}
                durationInFrames={scene.durationInFrames}
              >
                <LowerThirdScene
                  text={scene.text}
                  subtext={scene.subtext}
                  imageUrl={scene.imageUrl}
                  accentColor={accentColor}
                  backgroundColor={backgroundColor}
                />
              </Sequence>
            );

          case "split_screen":
            return (
              <Sequence
                key={i}
                from={from}
                durationInFrames={scene.durationInFrames}
              >
                <SplitScreenScene
                  text={scene.text}
                  subtext={scene.subtext}
                  imageUrl={scene.imageUrl}
                  accentColor={accentColor}
                  backgroundColor={backgroundColor}
                />
              </Sequence>
            );

          case "b_roll":
            return (
              <Sequence
                key={i}
                from={from}
                durationInFrames={scene.durationInFrames}
              >
                <BRollScene
                  text={scene.text}
                  subtext={scene.subtext}
                  imageUrl={scene.imageUrl}
                  accentColor={accentColor}
                  backgroundColor={backgroundColor}
                />
              </Sequence>
            );

          case "transition":
            return (
              <Sequence
                key={i}
                from={from}
                durationInFrames={scene.durationInFrames}
              >
                <TransitionScene
                  text={scene.text}
                  accentColor={accentColor}
                  backgroundColor={backgroundColor}
                />
              </Sequence>
            );

          default:
            return null;
        }
      })}
    </AbsoluteFill>
  );
};

// --- Calculate metadata (dynamic duration) ---

export const calculateStoryVideoMetadata = ({
  props,
}: {
  props: StoryVideoProps;
}) => {
  const totalFrames = props.scenes.reduce(
    (sum, scene) => sum + scene.durationInFrames,
    0,
  );
  return {
    durationInFrames: totalFrames || 150,
    fps: 30,
    width: 1080,
    height: 1080,
  };
};
