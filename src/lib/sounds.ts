let ctx: AudioContext | null = null;

function tone(freq: number, dur: number, type: OscillatorType = "triangle", gain = 0.15, delay = 0) {
  if (typeof window === "undefined") return;
  ctx ??= new AudioContext();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const t = ctx.currentTime + delay;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur);
}

export function playMoveSound(kind: "move" | "capture" | "check" | "end") {
  if (kind === "move") tone(520, 0.08, "triangle");
  else if (kind === "capture") {
    tone(300, 0.1, "square", 0.1);
    tone(180, 0.12, "triangle", 0.12, 0.03);
  } else if (kind === "check") {
    tone(660, 0.1, "sawtooth", 0.08);
    tone(880, 0.12, "sawtooth", 0.08, 0.08);
  } else {
    tone(523, 0.15, "sine", 0.15);
    tone(659, 0.15, "sine", 0.15, 0.12);
    tone(784, 0.3, "sine", 0.15, 0.24);
  }
}
