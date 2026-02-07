import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";

const GOLDEN_ANGLE = 137.508;

interface Particle {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
}

function generateParticles(count: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = i * GOLDEN_ANGLE * (Math.PI / 180);
    const radius = Math.sqrt(i / count);
    particles.push({
      x: 50 + radius * 45 * Math.cos(angle),
      y: 50 + radius * 45 * Math.sin(angle),
      size: 2 + (i % 3) * 1.5,
      speed: 0.3 + (i % 5) * 0.15,
      opacity: 0.15 + (i % 4) * 0.1,
    });
  }
  return particles;
}

export const ParticleField: React.FC<{
  color: string;
  count?: number;
}> = ({ color, count = 30 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const particles = React.useMemo(() => generateParticles(count), [count]);

  const fadeIn = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: fadeIn, overflow: "hidden" }}>
      {particles.map((p, i) => {
        const yOffset = interpolate(
          frame,
          [0, durationInFrames],
          [0, -p.speed * 40],
          { extrapolateRight: "clamp" },
        );
        const xDrift = Math.sin((frame * 0.02 + i) * p.speed) * 8;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              backgroundColor: color,
              opacity: p.opacity,
              transform: `translate(${xDrift}px, ${yOffset}px)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
