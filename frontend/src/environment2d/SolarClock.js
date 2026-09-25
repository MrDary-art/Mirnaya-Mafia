// Real UTC time and monotonic animation time are deliberately separate.
export class SolarClock {
  constructor(wallNow = () => Date.now(), monotonicNow = () => performance.now()) {
    this.wallNow = wallNow;
    this.monotonicNow = monotonicNow;
    this.epochSample = wallNow();
    this.monotonicSample = monotonicNow();
  }

  currentEpochMs() {
    return this.epochSample + Math.max(0, this.monotonicNow() - this.monotonicSample);
  }

  resync() {
    const before = this.currentEpochMs();
    this.epochSample = this.wallNow();
    this.monotonicSample = this.monotonicNow();
    return this.epochSample - before;
  }
}
