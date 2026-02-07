import React from "react";
import { useCurrentFrame, interpolate } from "remotion";

export const GlowEffect: React.FC<{
  color: string;
  intensity?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ color, intensity = 20, children, style }) => {
  const frame = useCurrentFrame();

  // Pulsing glow: oscillates using a sine wave
  const pulse = interpolate(Math.sin(frame * 0.08), [-1, 1], [0.6, 1]);
  const blur = intensity * pulse;

  return (
    <div
      style={{
        filter: `drop-shadow(0 0 ${blur}px ${color}) drop-shadow(0 0 ${blur * 0.5}px ${color})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
