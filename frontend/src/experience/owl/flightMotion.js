const clamp = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

// World travel is owned by the runtime. GLB clips only articulate the bird locally.
export function flightMotion(progress, direction = 1) {
  const p = clamp(progress);
  const travel = smooth((p - 0.20) / 0.60);
  const powered = smooth((p - 0.22) / 0.14) * (1 - smooth((p - 0.82) / 0.13));
  const beatPhase = Math.PI * 2 * (4.2 * p - 0.84);
  const stroke = Math.sin(beatPhase);
  const crouch = -0.07 * smooth((p - 0.10) / 0.10) * (1 - smooth((p - 0.23) / 0.08));
  const lift = Math.sin(Math.PI * travel) ** 2 * 0.55 + crouch
    + Math.max(0, stroke) * powered * 0.022;
  const bank = -Math.sign(direction) * Math.sin(Math.PI * travel) * powered * 0.075;
  const flap = stroke * powered * 0.48;
  const phase = p < 0.10 ? "focus"
    : p < 0.23 ? "prepare"
      : p < 0.42 ? "takeoff"
        : p < 0.72 ? "poweredFlight"
          : p < 0.82 ? "glide"
            : p < 0.94 ? "brake" : "landing";
  return { phase, travel, lift, bank, flap, powered, beatPhase };
}
