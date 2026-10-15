"""Render the original, quiet Arena Serial ambient loop using only the stdlib."""
from array import array
from math import exp, pi, sin, tanh
from pathlib import Path
import sys
import wave


def render() -> Path:
    rate = 22050
    chord_seconds = 6.0
    chords = ((48, 55, 60, 64, 74), (41, 53, 57, 60, 67),
              (45, 52, 57, 60, 71), (43, 50, 55, 62, 69))
    seconds = chord_seconds * len(chords)
    samples = array("h")
    for index in range(int(rate * seconds)):
        time = index / rate
        chord = chords[int(time // chord_seconds) % len(chords)]
        local = time % chord_seconds
        envelope = min(1.0, local / 0.7, (chord_seconds - local) / 0.8)
        pad = sum(sin(2 * pi * 440 * 2 ** ((note - 69) / 12) * time + voice * 0.2)
                  / (voice + 2) for voice, note in enumerate(chord)) * envelope * 0.06
        melody = 0.0
        for beat, note in enumerate((chord[2], chord[3], chord[4], chord[3])):
            elapsed = local - beat * 1.5
            if elapsed >= 0:
                frequency = 440 * 2 ** ((note - 69) / 12)
                attack = min(1.0, elapsed / 0.025)
                decay = exp(-elapsed * 1.8)
                melody += (sin(2 * pi * frequency * elapsed)
                           + 0.18 * sin(4 * pi * frequency * elapsed)) * attack * decay * 0.075
        edge = min(1.0, time / 0.4, (seconds - time) / 0.4)
        samples.append(int(tanh((pad + melody) * edge) * 32767))
    if sys.byteorder != "little":
        samples.byteswap()
    target = Path(__file__).resolve().parents[1] / "public/assets/serials/quiet-evening.wav"
    target.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(target), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(samples.tobytes())
    return target


if __name__ == "__main__":
    print(render())
