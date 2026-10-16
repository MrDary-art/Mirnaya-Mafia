// Grid search in screen coordinates. Obstacles already include the bird's size.
export function flightRoute(start, target, bounds, obstacles) {
  const step = 24;
  const cols = Math.max(2, Math.ceil((bounds.right - bounds.left) / step) + 1);
  const rows = Math.max(2, Math.ceil((bounds.bottom - bounds.top) / step) + 1);
  const points = Array.from({ length: cols * rows }, (_, i) => ({
    x: bounds.left + (i % cols) * (bounds.right - bounds.left) / (cols - 1),
    y: bounds.top + Math.floor(i / cols) * (bounds.bottom - bounds.top) / (rows - 1),
  }));
  const free = points.map(p => !obstacles.some(r => p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom));
  const nearest = p => points.reduce((best, q, i) => free[i] && (best < 0 || Math.hypot(q.x-p.x,q.y-p.y) < Math.hypot(points[best].x-p.x,points[best].y-p.y)) ? i : best, -1);
  const first = nearest(start), end = nearest(target);
  if (first < 0 || end < 0) return [];
  const queue = [first], previous = new Map([[first, -1]]);
  for (let n = 0; n < queue.length; n++) {
    const i = queue[n];
    if (i === end) break;
    for (const j of [i-cols, i+cols, ...(i%cols ? [i-1] : []), ...(i%cols < cols-1 ? [i+1] : [])]) {
      if (j < 0 || j >= points.length || !free[j] || previous.has(j)) continue;
      previous.set(j,i); queue.push(j);
    }
  }
  if (!previous.has(end)) return [];
  const route = [];
  for (let i=end; i!==-1; i=previous.get(i)) route.unshift(points[i]);
  return route;
}
