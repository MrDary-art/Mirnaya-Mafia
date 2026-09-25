export function effectDpr({ width, height, deviceDpr = 1, quality = "auto" }) {
  const mobile = width < 768;
  const cap = quality === "ultra" ? 2 : quality === "high" ? mobile ? 1.5 : 2
    : quality === "economy" ? 1 : mobile ? 1.25 : 1.5;
  const maxPixels = quality === "ultra" ? 16_600_000 : quality === "economy" ? 2_000_000 : 9_000_000;
  const areaLimit = Math.sqrt(maxPixels / Math.max(1, width * height));
  return Math.max(.35, Math.min(deviceDpr || 1, cap, areaLimit));
}

export function artCoverage({ sourcePixelsInCrop, displayedCssPixels, targetArtDpr = 2 }) {
  if (!Number.isFinite(sourcePixelsInCrop) || !Number.isFinite(displayedCssPixels)
    || sourcePixelsInCrop <= 0 || displayedCssPixels <= 0) return 0;
  return sourcePixelsInCrop / (displayedCssPixels * targetArtDpr);
}
