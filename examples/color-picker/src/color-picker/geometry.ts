/** Coordinates are fractions of the control's width and height. */
export function ringPoint(x: number, y: number) {
  return {
    hue: ((Math.atan2(y - 0.5, x - 0.5) * 180) / Math.PI + 450) % 360,
    radius: Math.hypot(x - 0.5, y - 0.5),
  };
}

/** Marker coordinates are percentages, centered on the hue ring's track. */
export function ringPosition(hue: number) {
  const angle = ((hue - 90) * Math.PI) / 180;
  return { x: 50 + 44 * Math.cos(angle), y: 50 + 44 * Math.sin(angle) };
}

export function planePoint(x: number, y: number) {
  return { saturation: Math.max(0, Math.min(1, x)) * 100, value: (1 - Math.max(0, Math.min(1, y))) * 100 };
}
