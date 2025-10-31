import { useTransform, MotionValue } from "framer-motion";
import { interpolate } from "flubber";
import { useMemo } from "react";

/**
 * Get the index of a path in an array of paths for smooth interpolation
 */
export function getIndex(paths: string[]) {
  return (_: any, i: number) => i;
}

/**
 * Use flubber to smoothly interpolate between SVG paths
 * @param progress - Motion value representing progress through the paths
 * @param paths - Array of SVG path strings to morph between
 */
export function useFlubber(progress: MotionValue<number>, paths: string[]) {
  return useTransform(progress, paths.map(getIndex(paths)), paths, {
    mixer: (from: string, to: string) => interpolate(from, to, { maxSegmentLength: 0.1 })
  });
}

