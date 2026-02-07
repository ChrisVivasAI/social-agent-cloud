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
import { ParticleField } from "../shared/ParticleField.js";
import { TextReveal } from "../shared/TextReveal.js";
import { GlowEffect } from "../shared/GlowEffect.js";
import { SceneTransition } from "../shared/SceneTransition.js";
import { AnimatedCaption } from "../shared/AnimatedCaption.js";

// --- Schema ---

const timedCaptionSchema = z.object({
  word: z.string(),
  startFrame: z.number(),
  endFrame: z.number(),
});

const sceneSchema = z.object({
  type: z.enum(["intro", "headline", "key_point", "source", "outro", "hero_image"]),
  text: z.string(),
  subtext: z.string().optional(),
  durationInFrames: z.number(),
  imageUrl: z.string().optional(),
});

export const techNewsVideoSchema = z.object({
  headline: z.string(),
  keyPoints: z.array(z.string()),
  sourceUrl: z.string(),
  sourceName: z.string(),
  scenes: z.array(sceneSchema),
  voiceoverUrl: z.string().optional(),
  logoUrl: z.string().optional(),
  heroImageUrl: z.string().optional(),
  accentColor: z.string().default("#d97757"),
  backgroundColor: z.string().default("#141413"),
  brandName: z.string().default("Tech News"),
  captions: z.array(timedCaptionSchema).optional(),
  showCaptions: z.boolean().default(true),
});

export type TechNewsVideoProps = z.infer<typeof techNewsVideoSchema>;

// --- Background Image Layer ---

const BackgroundImage: React.FC<{
  imageUrl: string;
  opacity?: number;
}> = ({ imageUrl, opacity = 0.3 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Subtle Ken Burns zoom
  const zoom = interpolate(frame, [0, durationInFrames], [1.0, 1.1], {
    extrapolateRight: "clamp",
  });

  return (
    <>
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <Img
          src={imageUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity,
            transform: `scale(${zoom})`,
          }}
        />
      </AbsoluteFill>
      {/* Dark gradient overlay for text readability */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.7) 100%)",
        }}
      />
    </>
  );
};

// --- Animated Progress Bar ---

const ProgressBar: React.FC<{
  index: number;
  total: number;
  accentColor: string;
}> = ({ index, total, accentColor }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const segmentWidth = 100 / total;
  const completedWidth = index * segmentWidth;
  const currentProgress = interpolate(frame, [0, durationInFrames], [0, segmentWidth], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: 50,
        left: 60,
        right: 60,
        height: 4,
        backgroundColor: "rgba(255,255,255,0.1)",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${completedWidth + currentProgress}%`,
          height: "100%",
          backgroundColor: accentColor,
          borderRadius: 2,
        }}
      />
    </div>
  );
};

// --- Scene Components ---

const IntroScene: React.FC<{
  text: string;
  brandName: string;
  accentColor: string;
  backgroundColor: string;
  logoUrl?: string;
}> = ({ text, brandName, accentColor, backgroundColor, logoUrl }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 12, mass: 0.6 } });

  return (
    <SceneTransition>
      <AnimatedBackground color1={backgroundColor} color2={accentColor} />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {logoUrl && (
          <Img
            src={logoUrl}
            style={{
              width: 120,
              height: 120,
              marginBottom: 24,
              transform: `scale(${logoScale})`,
              objectFit: "contain",
            }}
          />
        )}
        <GlowEffect color={accentColor} intensity={25}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 900,
              color: accentColor,
              letterSpacing: 4,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {brandName}
          </div>
        </GlowEffect>
        <div
          style={{
            fontSize: 28,
            color: "rgba(255,255,255,0.7)",
            marginTop: 20,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <TextReveal text={text} mode="word" startFrame={12} />
        </div>
      </AbsoluteFill>
    </SceneTransition>
  );
};

const HeadlineScene: React.FC<{
  text: string;
  accentColor: string;
  backgroundColor: string;
}> = ({ text, accentColor, backgroundColor }) => {
  const frame = useCurrentFrame();

  const lineWidth = interpolate(frame, [0, 20], [0, 800], {
    extrapolateRight: "clamp",
  });

  return (
    <SceneTransition>
      <AnimatedBackground color1={backgroundColor} color2={accentColor} variant="diagonal" />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 60,
        }}
      >
        <GlowEffect color={accentColor} intensity={15}>
          <div
            style={{
              width: lineWidth,
              height: 4,
              backgroundColor: accentColor,
              marginBottom: 40,
              borderRadius: 2,
            }}
          />
        </GlowEffect>
        <h1
          style={{
            color: "white",
            fontSize: 56,
            fontWeight: 800,
            textAlign: "center",
            lineHeight: 1.3,
            maxWidth: "90%",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <TextReveal text={text} mode="word" startFrame={5} staggerFrames={4} />
        </h1>
      </AbsoluteFill>
    </SceneTransition>
  );
};

const KeyPointScene: React.FC<{
  text: string;
  subtext?: string;
  index: number;
  total: number;
  accentColor: string;
  backgroundColor: string;
  imageUrl?: string;
}> = ({ text, subtext, index, total, accentColor, backgroundColor, imageUrl }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const numberScale = spring({ frame, fps, config: { damping: 10 } });
  const subtextOpacity = interpolate(frame, [18, 30], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <SceneTransition>
      <AnimatedBackground color1={backgroundColor} color2={accentColor} />
      {imageUrl && <BackgroundImage imageUrl={imageUrl} opacity={0.3} />}
      <ParticleField color={accentColor} count={25} />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 60,
        }}
      >
        {/* Number indicator */}
        <GlowEffect color={accentColor} intensity={30}>
          <div
            style={{
              fontSize: 120,
              fontWeight: 900,
              color: accentColor,
              opacity: 0.3,
              transform: `scale(${numberScale})`,
              position: "absolute",
              top: 80,
              left: 80,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {index + 1}
          </div>
        </GlowEffect>

        {/* Key point text */}
        <div
          style={{
            fontSize: 42,
            fontWeight: 700,
            color: "white",
            textAlign: "center",
            maxWidth: "80%",
            lineHeight: 1.4,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <TextReveal text={text} mode="word" startFrame={6} staggerFrames={3} />
        </div>

        {/* Subtext */}
        {subtext && (
          <div
            style={{
              fontSize: 26,
              color: "rgba(255,255,255,0.6)",
              textAlign: "center",
              maxWidth: "75%",
              marginTop: 20,
              opacity: subtextOpacity,
              lineHeight: 1.5,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {subtext}
          </div>
        )}

        {/* Animated progress bar */}
        <ProgressBar index={index} total={total} accentColor={accentColor} />
      </AbsoluteFill>
    </SceneTransition>
  );
};

const SourceScene: React.FC<{
  text: string;
  subtext?: string;
  accentColor: string;
  backgroundColor: string;
}> = ({ text, subtext, accentColor, backgroundColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const contentScale = spring({
    frame,
    fps,
    config: { damping: 12 },
  });

  return (
    <SceneTransition>
      <AnimatedBackground color1={backgroundColor} color2={accentColor} variant="mesh" />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${interpolate(contentScale, [0, 1], [0.9, 1])})`,
          opacity: contentScale,
        }}
      >
        <div
          style={{
            fontSize: 28,
            color: "rgba(255,255,255,0.5)",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {text}
        </div>
        {subtext && (
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: accentColor,
              marginTop: 16,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {subtext}
          </div>
        )}
      </AbsoluteFill>
    </SceneTransition>
  );
};

const HeroImageScene: React.FC<{
  heroImageUrl: string;
  text: string;
  accentColor: string;
  backgroundColor: string;
}> = ({ heroImageUrl, text, accentColor, backgroundColor }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Ken Burns: slow zoom from 1.0 to 1.15 over the scene duration
  const zoom = interpolate(frame, [0, durationInFrames], [1.0, 1.15], {
    extrapolateRight: "clamp",
  });
  const textOpacity = interpolate(frame, [10, 25], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <SceneTransition>
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <Img
          src={heroImageUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${zoom})`,
          }}
        />
      </AbsoluteFill>
      {/* Animated gradient overlay */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(transparent 30%, ${backgroundColor}cc 100%)`,
        }}
      />
      {text && (
        <GlowEffect color={accentColor} intensity={12}>
          <div
            style={{
              position: "absolute",
              bottom: 80,
              left: 60,
              right: 60,
              fontSize: 36,
              fontWeight: 700,
              color: "white",
              textAlign: "center",
              opacity: textOpacity,
              textShadow: "0 2px 20px rgba(0,0,0,0.8)",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {text}
          </div>
        </GlowEffect>
      )}
      {/* Accent line at bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 4,
          backgroundColor: accentColor,
        }}
      />
    </SceneTransition>
  );
};

const OutroScene: React.FC<{
  brandName: string;
  accentColor: string;
  backgroundColor: string;
  logoUrl?: string;
}> = ({ brandName, accentColor, backgroundColor, logoUrl }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 12, mass: 0.6 } });
  const scale = spring({ frame: Math.max(0, frame - 8), fps, config: { damping: 10 } });

  return (
    <SceneTransition>
      <AnimatedBackground color1={backgroundColor} color2={accentColor} />
      <ParticleField color={accentColor} count={20} />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {logoUrl && (
          <Img
            src={logoUrl}
            style={{
              width: 100,
              height: 100,
              marginBottom: 20,
              transform: `scale(${logoScale})`,
              objectFit: "contain",
            }}
          />
        )}
        <GlowEffect color={accentColor} intensity={30}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 900,
              color: accentColor,
              transform: `scale(${scale})`,
              letterSpacing: 6,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {brandName}
          </div>
        </GlowEffect>
      </AbsoluteFill>
    </SceneTransition>
  );
};

// --- Main Composition ---

export const TechNewsVideo: React.FC<TechNewsVideoProps> = ({
  headline,
  keyPoints,
  sourceUrl,
  sourceName,
  scenes,
  voiceoverUrl,
  logoUrl,
  heroImageUrl,
  accentColor,
  backgroundColor,
  brandName,
  captions,
  showCaptions,
}) => {
  // Track key_point index for progress bar
  const totalKeyPoints = scenes.filter((s) => s.type === "key_point").length;
  let keyPointIndex = 0;
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
          case "intro":
            return (
              <Sequence
                key={i}
                from={from}
                durationInFrames={scene.durationInFrames}
              >
                <IntroScene
                  text={scene.text}
                  brandName={brandName}
                  accentColor={accentColor}
                  backgroundColor={backgroundColor}
                  logoUrl={logoUrl}
                />
              </Sequence>
            );

          case "headline":
            return (
              <Sequence
                key={i}
                from={from}
                durationInFrames={scene.durationInFrames}
              >
                <HeadlineScene
                  text={scene.text}
                  accentColor={accentColor}
                  backgroundColor={backgroundColor}
                />
              </Sequence>
            );

          case "key_point": {
            const currentIndex = keyPointIndex++;
            return (
              <Sequence
                key={i}
                from={from}
                durationInFrames={scene.durationInFrames}
              >
                <KeyPointScene
                  text={scene.text}
                  subtext={scene.subtext}
                  index={currentIndex}
                  total={totalKeyPoints}
                  accentColor={accentColor}
                  backgroundColor={backgroundColor}
                  imageUrl={scene.imageUrl}
                />
              </Sequence>
            );
          }

          case "source":
            return (
              <Sequence
                key={i}
                from={from}
                durationInFrames={scene.durationInFrames}
              >
                <SourceScene
                  text={scene.text}
                  subtext={scene.subtext || sourceName}
                  accentColor={accentColor}
                  backgroundColor={backgroundColor}
                />
              </Sequence>
            );

          case "hero_image": {
            const imageSource = heroImageUrl || scene.imageUrl;
            return imageSource ? (
              <Sequence
                key={i}
                from={from}
                durationInFrames={scene.durationInFrames}
              >
                <HeroImageScene
                  heroImageUrl={imageSource}
                  text={scene.text}
                  accentColor={accentColor}
                  backgroundColor={backgroundColor}
                />
              </Sequence>
            ) : null;
          }

          case "outro":
            return (
              <Sequence
                key={i}
                from={from}
                durationInFrames={scene.durationInFrames}
              >
                <OutroScene
                  brandName={brandName}
                  accentColor={accentColor}
                  backgroundColor={backgroundColor}
                  logoUrl={logoUrl}
                />
              </Sequence>
            );

          default:
            return null;
        }
      })}

      {/* Auto-generated captions overlay */}
      {showCaptions && captions && captions.length > 0 && (() => {
        // Group words into segments of ~6 words for readability
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

// --- Calculate metadata (dynamic duration) ---

export const calculateTechNewsMetadata = ({
  props,
}: {
  props: TechNewsVideoProps;
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
