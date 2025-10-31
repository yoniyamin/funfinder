/**
 * SVG path definitions for simple, smooth morphing animations
 * Using only 4 simple shapes that morph well together
 */

// Circle - simple round shape
export const circlePath = "M12 2 C6.5 2 2 6.5 2 12 C2 17.5 6.5 22 12 22 C17.5 22 22 17.5 22 12 C22 6.5 17.5 2 12 2 Z";

// Star - 5-pointed star
export const starPath = "M12 2 L14.5 9.5 L22 10 L17 15 L18.5 22 L12 18 L5.5 22 L7 15 L2 10 L9.5 9.5 Z";

// Heart - simple heart shape
export const heartPath = "M12 21 C12 21 2 14 2 8.5 C2 6 3.5 4 6 4 C8 4 10 5 12 7 C14 5 16 4 18 4 C20.5 4 22 6 22 8.5 C22 14 12 21 12 21 Z";

// Square - rounded square
export const squarePath = "M4 6 C4 4.5 5 3 6.5 3 L17.5 3 C19 3 20 4.5 20 6 L20 18 C20 19.5 19 21 17.5 21 L6.5 21 C5 21 4 19.5 4 18 Z";

// Array of all paths for easy iteration (only 4 simple shapes)
export const iconPaths = [
  circlePath,
  starPath,
  heartPath,
  squarePath,
];

// Array of path names for debugging
export const iconNames = [
  "Circle",
  "Star",
  "Heart",
  "Square"
];

