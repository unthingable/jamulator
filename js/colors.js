// JAM 18-color palette with 4 brightness levels
// Value = (base & ~3) + brightness
// Brightness: bits 0-1 → 0=25%, 1=50%, 2=75%, 3=100%

const BASE_COLORS = [
  { name: 'OFF',          base: 0,  hex: null },
  { name: 'RED',          base: 4,  hex: '#ff0020' },
  { name: 'ORANGE',       base: 8,  hex: '#ff6600' },
  { name: 'LIGHT_ORANGE', base: 12, hex: '#ff9900' },
  { name: 'WARM_YELLOW',  base: 16, hex: '#ffcc00' },
  { name: 'YELLOW',       base: 20, hex: '#ffee00' },
  { name: 'LIME',         base: 24, hex: '#88ff00' },
  { name: 'GREEN',        base: 28, hex: '#00ff00' },
  { name: 'MINT',         base: 32, hex: '#00ff66' },
  { name: 'CYAN',         base: 36, hex: '#00ffcc' },
  { name: 'TURQUOISE',    base: 40, hex: '#00ccff' },
  { name: 'BLUE',         base: 44, hex: '#0066ff' },
  { name: 'PLUM',         base: 48, hex: '#aa44ff' },
  { name: 'VIOLET',       base: 52, hex: '#cc00ff' },
  { name: 'PURPLE',       base: 56, hex: '#dd00cc' },
  { name: 'MAGENTA',      base: 60, hex: '#ff0088' },
  { name: 'FUCHSIA',      base: 64, hex: '#ff0044' },
  { name: 'WHITE',        base: 68, hex: '#ffffff' },
];

// Build lookup table: value → { hex, opacity }
const COLOR_TABLE = new Map();

for (const { base, hex } of BASE_COLORS) {
  if (hex === null) {
    // OFF: all 4 brightness values map to off
    for (let b = 0; b < 4; b++) {
      COLOR_TABLE.set(base + b, { hex: 'transparent', opacity: 0 });
    }
  } else {
    for (let b = 0; b < 4; b++) {
      // Brightness curve: raised floor, wider spread for visible dim levels
      const BRIGHTNESS = [0.50, 0.72, 0.86, 1.0];
    //   const BRIGHTNESS = [0.45, 0.63, 0.82, 1.0];
      COLOR_TABLE.set(base + b, { hex, opacity: BRIGHTNESS[b] });
    }
  }
}

/**
 * Look up CSS color + opacity for a JAM color value.
 * @param {number} value - Color value (0-71)
 * @returns {{ hex: string, opacity: number }}
 */
export function lookupColor(value) {
  return COLOR_TABLE.get(value) || { hex: 'transparent', opacity: 0 };
}

/**
 * Get just the hex color at full brightness for a given value.
 * Useful for ripple effects that need the base color.
 */
export function lookupBaseHex(value) {
  const base = value & ~3;
  const entry = COLOR_TABLE.get(base + 3);
  return entry ? entry.hex : '#ffffff';
}

export { BASE_COLORS };
