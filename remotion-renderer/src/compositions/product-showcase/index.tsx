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

// --- Schema ---

const featureSchema = z.object({
  title: z.string(),
  description: z.string(),
});

const sceneSchema = z.object({
  type: z.enum(["intro", "hero", "feature", "cta", "outro"]),
  text: z.string(),
  subtext: z.string().optional(),
  durationInFrames: z.number(),
  imageUrl: z.string().optional(),
  featureIndex: z.number().optional(),
});

export const productShowcaseSchema = z.object({
  productName: z.string(),
  tagline: z.string(),
  features: z.array(featureSchema),
  ctaText: z.string(),
  ctaUrl: z.string().optional(),
  scenes: z.array(sceneSchema),
  voiceoverUrl: z.string().optional(),
  heroImageUrl: z.string().optional(),
  accentColor: z.string().default("#d97757"),
  backgroundColor: z.string().default("#141413"),
  brandName: z.string().optional(),
});

export type ProductShowcaseProps = z.infer<typeof productShowcaseSchema>;

// --- Scene Components ---

const IntroScene: React.FC<{
  productName: string;
  tagline: string;
  accentColor: string;
  backgroundColor: string;
}> = ({ productName, tagline, accentColor, backgroundColor }) => {
  const frame = useCurrentFrame();

  const taglineOpacity = interpolate(frame, [25, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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
          padding: 60,
        }}
      >
        <GlowEffect color={accentColor} intensity={25}>
          <div
            style={{
              fontSize: 60,
              fontWeight: 900,
              color: "white",
              textAlign: "center",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            <TextReveal text={productName} mode="word" startFrame={5} staggerFrames={4} />
          </div>
        </GlowEffect>
        <div
          style={{
            fontSize: 28,
            color: "rgba(255,255,255,0.7)",
            marginTop: 24,
            textAlign: "center",
            opacity: taglineOpacity,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {tagline}
        </div>
      </AbsoluteFill>
    </SceneTransition>
  );
};

const HeroScene: React.FC<{
  heroImageUrl: string;
  productName: string;
  accentColor: string;
  backgroundColor: string;
}> = ({ heroImageUrl, productName, accentColor, backgroundColor }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const zoom = interpolate(frame, [0, durationInFrames], [1.0, 1.12], {
    extrapolateRight: "clamp",
  });
  const nameOpacity = interpolate(frame, [10, 25], [0, 1], {
    extrapolateLeft: "clamp",
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
      <AbsoluteFill
        style={{
          background: `linear-gradient(transparent 30%, ${backgroundColor}cc 100%)`,
        }}
      />
      <GlowEffect color={accentColor} intensity={12}>
        <div
          style={{
            position: "absolute",
            bottom: 80,
            left: 60,
            right: 60,
            fontSize: 42,
            fontWeight: 800,
            color: "white",
            textAlign: "center",
            opacity: nameOpacity,
            textShadow: "0 2px 20px rgba(0,0,0,0.8)",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {productName}
        </div>
      </GlowEffect>
    </SceneTransition>
  );
};

const FeatureScene: React.FC<{
  featureIndex: number;
  title: string;
  description: string;
  accentColor: string;
  backgroundColor: string;
  imageUrl?: string;
}> = ({ featureIndex, title, description, accentColor, backgroundColor, imageUrl }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const numberScale = spring({ frame, fps, config: { damping: 10 } });
  const descOpacity = interpolate(frame, [18, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneTransition>
      <AnimatedBackground color1={backgroundColor} color2={accentColor} />
      {imageUrl && (
        <>
          <AbsoluteFill style={{ overflow: "hidden" }}>
            <Img
              src={imageUrl}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                opacity: 0.15,
              }}
            />
          </AbsoluteFill>
          <AbsoluteFill
            style={{
              background: "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.6) 100%)",
            }}
          />
        </>
      )}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          padding: 80,
        }}
      >
        {/* Left accent border */}
        <div
          style={{
            width: 4,
            height: "60%",
            backgroundColor: accentColor,
            borderRadius: 2,
            marginRight: 50,
            flexShrink: 0,
          }}
        />

        <div style={{ flex: 1 }}>
          {/* Number */}
          <div
            style={{
              fontSize: 80,
              fontWeight: 900,
              color: accentColor,
              opacity: 0.4,
              transform: `scale(${numberScale})`,
              lineHeight: 1,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {String(featureIndex + 1).padStart(2, "0")}
          </div>

          {/* Feature title */}
          <div
            style={{
              fontSize: 42,
              fontWeight: 700,
              color: "white",
              marginTop: 16,
              lineHeight: 1.3,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            <TextReveal text={title} mode="word" startFrame={5} staggerFrames={3} />
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: 26,
              color: "rgba(255,255,255,0.6)",
              marginTop: 16,
              lineHeight: 1.5,
              opacity: descOpacity,
              maxWidth: "90%",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {description}
          </div>
        </div>
      </AbsoluteFill>
    </SceneTransition>
  );
};

const CTAScene: React.FC<{
  ctaText: string;
  ctaUrl?: string;
  accentColor: string;
  backgroundColor: string;
}> = ({ ctaText, ctaUrl, accentColor, backgroundColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame, fps, config: { damping: 12 } });
  const urlOpacity = interpolate(frame, [20, 35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneTransition>
      <AnimatedBackground color1={backgroundColor} color2={accentColor} variant="diagonal" />
      <ParticleField color={accentColor} count={30} />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 60,
        }}
      >
        <GlowEffect color={accentColor} intensity={20}>
          <div
            style={{
              fontSize: 48,
              fontWeight: 800,
              color: "white",
              textAlign: "center",
              transform: `scale(${interpolate(scale, [0, 1], [0.8, 1])})`,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {ctaText}
          </div>
        </GlowEffect>
        {ctaUrl && (
          <div
            style={{
              fontSize: 28,
              color: accentColor,
              marginTop: 24,
              opacity: urlOpacity,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {ctaUrl}
          </div>
        )}
      </AbsoluteFill>
    </SceneTransition>
  );
};

const OutroScene: React.FC<{
  brandName?: string;
  accentColor: string;
  backgroundColor: string;
}> = ({ brandName, accentColor, backgroundColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame: Math.max(0, frame - 5), fps, config: { damping: 10 } });

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
        <GlowEffect color={accentColor} intensity={30}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 900,
              color: accentColor,
              transform: `scale(${scale})`,
              letterSpacing: 4,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {brandName || ""}
          </div>
        </GlowEffect>
      </AbsoluteFill>
    </SceneTransition>
  );
};

// --- Main Composition ---

export const ProductShowcase: React.FC<ProductShowcaseProps> = ({
  productName,
  tagline,
  features,
  ctaText,
  ctaUrl,
  scenes,
  voiceoverUrl,
  heroImageUrl,
  accentColor,
  backgroundColor,
  brandName,
}) => {
  let frameOffset = 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {voiceoverUrl && <Audio src={voiceoverUrl} />}

      {scenes.map((scene, i) => {
        const from = frameOffset;
        frameOffset += scene.durationInFrames;

        switch (scene.type) {
          case "intro":
            return (
              <Sequence key={i} from={from} durationInFrames={scene.durationInFrames}>
                <IntroScene
                  productName={productName}
                  tagline={tagline}
                  accentColor={accentColor}
                  backgroundColor={backgroundColor}
                />
              </Sequence>
            );

          case "hero": {
            const heroSrc = heroImageUrl || scene.imageUrl;
            return heroSrc ? (
              <Sequence key={i} from={from} durationInFrames={scene.durationInFrames}>
                <HeroScene
                  heroImageUrl={heroSrc}
                  productName={productName}
                  accentColor={accentColor}
                  backgroundColor={backgroundColor}
                />
              </Sequence>
            ) : null;
          }

          case "feature": {
            const fIdx = scene.featureIndex ?? 0;
            const feature = features[fIdx] || { title: scene.text, description: scene.subtext || "" };
            return (
              <Sequence key={i} from={from} durationInFrames={scene.durationInFrames}>
                <FeatureScene
                  featureIndex={fIdx}
                  title={feature.title}
                  description={feature.description}
                  accentColor={accentColor}
                  backgroundColor={backgroundColor}
                  imageUrl={scene.imageUrl}
                />
              </Sequence>
            );
          }

          case "cta":
            return (
              <Sequence key={i} from={from} durationInFrames={scene.durationInFrames}>
                <CTAScene
                  ctaText={ctaText}
                  ctaUrl={ctaUrl}
                  accentColor={accentColor}
                  backgroundColor={backgroundColor}
                />
              </Sequence>
            );

          case "outro":
            return (
              <Sequence key={i} from={from} durationInFrames={scene.durationInFrames}>
                <OutroScene
                  brandName={brandName}
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

export const calculateProductShowcaseMetadata = ({
  props,
}: {
  props: ProductShowcaseProps;
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
