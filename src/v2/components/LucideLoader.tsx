import React, { useEffect, useState } from "react";
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from "framer-motion";
import { iconPaths, iconNames } from "./icon-paths";
import { useFlubber, getIndex } from "./use-flubber";

/**
 * Lucide-friendly loader with morphSVG transitions.
 * - No rotation - icons morph smoothly between shapes
 * - Soft breathing pulse animation
 * - Smooth color transitions
 */

const DEFAULT_COLORS = [
  "#90C0D0", // teal
  "#F0B040", // orange
  "#E06040", // red-orange
  "#AACC68", // lime
  "#A0D0E0", // light blue
  "#F0C0B0", // blush
  "#9C7AE0", // violet
  "#FF9F6E", // coral
];

export default function LucideLoader({
  size = 64,
  color,               // deprecated single color (kept for backward compat)
  colors = DEFAULT_COLORS,
  intervalMs = 1200,   // Time to morph to next icon (increased for smoother transitions)
}: {
  size?: number;
  color?: string;      // if provided, overrides cycling and uses one color
  colors?: string[];   // cycle through these per icon
  intervalMs?: number;
}) {
  const [pathIndex, setPathIndex] = useState(0);
  const progress = useMotionValue(pathIndex);
  const reduce = useReducedMotion();

  // Create smooth color transitions
  const fill = useTransform(
    progress,
    iconPaths.map(getIndex(iconPaths)),
    color ? Array(iconPaths.length).fill(color) : colors.slice(0, iconPaths.length)
  );

  // Use flubber for smooth SVG path morphing
  const path = useFlubber(progress, iconPaths);

  // Animate to next icon
  useEffect(() => {
    if (reduce) return; // Skip animation if reduced motion is preferred

    const animation = animate(progress, pathIndex, {
      duration: intervalMs / 1000,
      ease: "easeInOut",
      onComplete: () => {
        // Loop back to start after last icon
        if (pathIndex === iconPaths.length - 1) {
          progress.set(0);
          setPathIndex(1);
        } else {
          setPathIndex(pathIndex + 1);
        }
      }
    });

    return () => animation.stop();
  }, [pathIndex, intervalMs, reduce, progress]);

  return (
    <div className="inline-flex items-center justify-center">
      {/* Pulsating wrapper (breathing) */}
      <motion.div
        role="img"
        aria-label="Loading"
        animate={reduce ? {} : { scale: [1, 1.06, 1] }}
        transition={{ duration: 1.2, ease: "easeInOut", repeat: Infinity }}
        className="inline-flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        {/* SVG with morphing path */}
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ overflow: 'visible' }}
        >
          <motion.path
            d={path}
            stroke={fill}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </motion.div>
    </div>
  );
}

