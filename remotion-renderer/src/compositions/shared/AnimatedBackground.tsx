import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";

type Variant = "radial" | "diagonal" | "mesh";

export const AnimatedBackground: React.FC<{
  color1: string;
  color2: string;
  variant?: Variant;
}> = ({ color1, color2, variant = "radial" }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: "clamp",
  });

  if (variant === "diagonal") {
    const angle = interpolate(progress, [0, 1], [135, 165]);
    return (
      <AbsoluteFill
        style={{
          background: `linear-gradient(${angle}deg, ${color1} 0%, ${color2} 50%, ${color1} 100%)`,
        }}
      />
    );
  }

  if (variant === "mesh") {
    const shift1 = interpolate(progress, [0, 1], [30, 70]);
    const shift2 = interpolate(progress, [0, 1], [70, 30]);
    return (
      <AbsoluteFill
        style={{
          background: `
            radial-gradient(ellipse at ${shift1}% ${shift2}%, ${color2}44 0%, transparent 50%),
            radial-gradient(ellipse at ${shift2}% ${shift1}%, ${color2}33 0%, transparent 50%),
            ${color1}
          `,
        }}
      />
    );
  }

  // radial (default)
  const size = interpolate(progress, [0, 1], [40, 70]);
  const posX = interpolate(progress, [0, 1], [50, 55]);
  const posY = interpolate(progress, [0, 1], [50, 45]);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse ${size}% ${size}% at ${posX}% ${posY}%, ${color2}55 0%, ${color1} 100%)`,
      }}
    />
  );
};
