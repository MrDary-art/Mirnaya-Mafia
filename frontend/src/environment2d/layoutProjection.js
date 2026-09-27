/** Match the image's object-fit: cover geometry, including the hand-cut mobile crop. */
export function createSceneProjection(scene, frame, { mobile = false, parallaxY = 0, mediaScale = 1.035 } = {}) {
  const source = mobile
    ? scene.mobileCrop
    : { left: 0, top: 0, width: scene.artboard.width, height: scene.artboard.height };
  const scale = Math.max(frame.width / source.width, frame.height / source.height);
  const imageLeft = frame.left + (frame.width - source.width * scale) / 2;
  const imageTop = frame.top + (frame.height - source.height * scale) / 2;
  const centerX = frame.left + frame.width / 2;
  const centerY = frame.top + frame.height / 2;

  return ([u, v]) => {
    const x = imageLeft + (u * scene.artboard.width - source.left) * scale;
    const y = imageTop + (v * scene.artboard.height - source.top) * scale;
    return [centerX + (x - centerX) * mediaScale,
      centerY + (y - centerY) * mediaScale + parallaxY];
  };
}

export function projectPolygon(points, project) {
  return points.map(project);
}
