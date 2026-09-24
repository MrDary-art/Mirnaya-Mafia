const motions = {
  ai: (t) => ({ x: Math.sin(t * .68) * .56, y: Math.cos(t * .68) * .24, z: Math.sin(t * .68 + .8) * .28 }),
  rooms: (t) => ({ x: Math.sin(t * .62) * .56, y: Math.sin(t * 1.24) * .16, z: Math.cos(t * .62) * .23 }),
  scenarios: (t) => ({ x: Math.sin(t * .54) * .46, y: Math.cos(t * .78) * .18, z: Math.sin(t * .54) * .35 }),
  learning: (t) => ({ x: Math.sin(t * .46) * .7, y: Math.cos(t * .46) * .35, z: Math.sin(t * .46 + .7) * .45 }),
  history: (t) => ({ x: Math.sin(t * .39) * .25, y: Math.sin(t * .7) * .42, z: Math.cos(t * .39) * .3 }),
  friends: (t) => ({ x: Math.sin(t * .35) * .65, y: Math.cos(t * .35) * .25, z: -.45 + Math.sin(t * .35) * .3 }),
  profile: (t) => ({ x: Math.sin(t * .51) * .58, y: Math.cos(t * .51) * .28, z: Math.sin(t * .51 + .4) * .4 }),
  finale: (t) => ({ x: Math.sin(t * .41) * .44, y: Math.cos(t * .41) * .32, z: Math.sin(t * .41) * .26 }),
};

export function aerialOffset(sectionId, seconds, width = 1440) {
  const movement = (motions[sectionId] || motions.ai)(seconds);
  const scale = width < 768 ? .42 : 1;
  return { x: movement.x * scale, y: movement.y * scale, z: movement.z * scale };
}
