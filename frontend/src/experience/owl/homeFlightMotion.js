const clamp = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => { const t = clamp(value); return t * t * (3 - 2 * t); };

export function homeFlightMotion({ beatPhase, speed, takeoffAge = Infinity, landingAge = Infinity, direction = 1 }) {
  const frequency = speed === "jump" ? 3.8 : speed === "fast" ? 3.3 : speed === "slow" ? 1.95 : 2.5;
  const takeoff = Number.isFinite(takeoffAge) && takeoffAge < 1.42;
  const landing = Number.isFinite(landingAge) && landingAge < 1.2;
  const opening = takeoff ? smooth((takeoffAge - .48) / .28) : 1;
  const push = takeoff ? smooth((takeoffAge - .82) / .26) : 1;
  const braking = landing ? 1 - smooth((landingAge - .55) / .48) : 1;
  const glide = speed === "slow" && !takeoff && !landing
    ? .85 + .15 * Math.sin(beatPhase * .27) : 1;
  const powered = opening * braking * glide;
  const flap = Math.sin(beatPhase) * powered * (takeoff ? .54 : speed === "jump" ? .53 : .43);
  const bank = direction * (landing ? .03 : speed === "jump" ? .18 : speed === "fast" ? .13 : .075);
  const crouch = takeoff && takeoffAge < .9 ? -.09 * smooth((takeoffAge - .62) / .18) : 0;
  const lift = takeoff ? smooth((takeoffAge - .82) / .55) * .18 + crouch : 0;
  const phase = takeoff ? takeoffAge < .48 ? "focus" : takeoffAge < .82 ? "prepare" : "takeoff"
    : landing ? landingAge < .6 ? "brake" : "landing"
      : speed === "jump" ? "catchUpFlight" : speed === "slow" ? "aerialOrbit" : "poweredFlight";
  return { phase, frequency, powered, flap, bank, lift, beatPhase, travel: push };
}
