export const MIN_POS_TILE_WIDTH = 112;
export const MAX_POS_TILE_WIDTH = 224;
export const DEFAULT_POS_TILE_WIDTH = 144;

export function posTileWidth(value?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_POS_TILE_WIDTH;
  return Math.max(MIN_POS_TILE_WIDTH, Math.min(MAX_POS_TILE_WIDTH, value));
}