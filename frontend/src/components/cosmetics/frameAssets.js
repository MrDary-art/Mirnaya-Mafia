// Frame codes are persisted in user inventories, so the mapping stays stable while
// the artwork can be replaced as a complete collection.
export const FANTASY_FRAME_CODES = [
  "frame_classic", "frame_minimal", "frame_violet", "frame_cyber", "frame_emerald",
  "frame_electric", "frame_executive", "frame_neon", "frame_ice", "frame_gold",
  "frame_diplomat", "frame_grandmaster", "frame_prism",
];

const fantasyFramePaths = Object.fromEntries(
  FANTASY_FRAME_CODES.map((code) => [code, `frames/fantasy/${code}.webp`]),
);

export function frameImageForCode(code) {
  return fantasyFramePaths[code] || fantasyFramePaths.frame_classic;
}
