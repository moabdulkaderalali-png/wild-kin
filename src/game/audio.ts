// Prozedurale Sounds (WebAudio) – Tierstimmen, Treffer, Schritte, Ambiente.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ambientGain: GainNode | null = null;
let ambientSrc: AudioBufferSourceNode | null = null;
let ambientFilter: BiquadFilterNode | null = null;
let enabled = true;
let currentAmbient = "";

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setAudioEnabled(v: boolean) {
  enabled = v;
  if (master) master.gain.value = v ? 0.35 : 0;
}

export function isAudioEnabled() {
  return enabled;
}

export function unlockAudio() {
  ac();
}

function noiseBuffer(c: AudioContext, seconds = 2): AudioBuffer {
  const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export function tone(
  freq: number,
  dur: number,
  type: OscillatorType = "sine",
  vol = 0.3,
  wobble = 0,
) {
  const c = ac();
  if (!c || !master || !enabled) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (wobble)
    o.frequency.linearRampToValueAtTime(
      Math.max(40, freq + (Math.random() - 0.5) * wobble * 2),
      c.currentTime + dur,
    );
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(master);
  o.start();
  o.stop(c.currentTime + dur + 0.05);
}

export function noiseBurst(dur = 0.15, freq = 900, q = 1, vol = 0.3) {
  const c = ac();
  if (!c || !master || !enabled) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 0.5);
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  src.connect(f).connect(g).connect(master);
  src.start();
  src.stop(c.currentTime + dur + 0.05);
}

export const sfx = {
  voice(v: { freq: number; type: OscillatorType; dur: number; wobble: number }) {
    tone(v.freq, v.dur, v.type, 0.18, v.wobble);
  },
  bite() {
    noiseBurst(0.09, 1600, 1.4, 0.25);
    tone(120, 0.09, "square", 0.12, 40);
  },
  paw() {
    noiseBurst(0.07, 2600, 2, 0.18);
  },
  horn() {
    tone(90, 0.18, "square", 0.22, 30);
  },
  hit() {
    noiseBurst(0.12, 400, 0.8, 0.3);
  },
  step(water: boolean) {
    noiseBurst(0.05, water ? 700 : 2200, water ? 0.8 : 3, water ? 0.12 : 0.05);
  },
  jump() {
    tone(260, 0.15, "triangle", 0.12, 200);
  },
  splash() {
    noiseBurst(0.3, 600, 0.6, 0.22);
  },
  coin() {
    tone(1400, 0.07, "triangle", 0.12);
    setTimeout(() => tone(2100, 0.08, "triangle", 0.1), 60);
  },
  buy() {
    [660, 880, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.12, "triangle", 0.15), i * 90));
  },
  defeat() {
    tone(220, 0.4, "sawtooth", 0.12, -120);
    noiseBurst(0.4, 300, 0.5, 0.15);
  },
  special() {
    tone(500, 0.25, "triangle", 0.14, 500);
  },
};

// Biom-Ambiente: gefiltertes Rauschen (Wind / Wasser / Dschungel)
export function setAmbient(kind: string) {
  const c = ac();
  if (!c || !master) return;
  if (kind === currentAmbient) return;
  currentAmbient = kind;
  if (!ambientSrc) {
    ambientSrc = c.createBufferSource();
    ambientSrc.buffer = noiseBuffer(c, 4);
    ambientSrc.loop = true;
    ambientFilter = c.createBiquadFilter();
    ambientFilter.type = "bandpass";
    ambientGain = c.createGain();
    ambientGain.gain.value = 0.05;
    ambientSrc.connect(ambientFilter).connect(ambientGain).connect(master);
    ambientSrc.start();
  }
  const map: Record<string, [number, number, number]> = {
    desert: [420, 0.6, 0.05],
    snow: [300, 0.5, 0.06],
    ice: [300, 0.5, 0.06],
    jungle: [1500, 1.2, 0.045],
    forest: [800, 0.9, 0.035],
    grass: [700, 0.8, 0.03],
    savanna: [600, 0.7, 0.035],
    river: [1100, 0.7, 0.06],
    lake: [900, 0.7, 0.05],
    ocean: [500, 0.5, 0.07],
    deep: [400, 0.5, 0.07],
    swamp: [1000, 1, 0.045],
    beach: [700, 0.6, 0.06],
    mountain: [500, 0.6, 0.05],
  };
  const cfg = map[kind] ?? [700, 0.8, 0.03];
  if (ambientFilter && ambientGain) {
    ambientFilter.frequency.value = cfg[0];
    ambientFilter.Q.value = cfg[1];
    ambientGain.gain.value = cfg[2];
  }
}
