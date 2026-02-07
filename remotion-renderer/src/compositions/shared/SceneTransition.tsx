import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";

const OVERLAP_FRAMES = 8;

export const SceneTransition: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Fade in over first OVERLAP_FRAMES, fade out over last OVERLAP_FRAMES
  const enterOpacity = interpolate(frame, [0, OVERLAP_FRAMES], [0, 1], {
    extrapolateRight: "clamp",
  });
  const exitStart = Math.max(0, durationInFrames - OVERLAP_FRAMES);
  const exitOpacity = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity = Math.min(enterOpacity, exitOpacity);

  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};
