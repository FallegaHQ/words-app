// ── Procedural SFX (Web Audio API, no external files) ─────────────────────────

const STORAGE_KEY = 'luckyLetters_sfxEnabled';

export type SFXId =
  | 'scratch'
  | 'tick'
  | 'tile_reveal'
  | 'word_complete'
  | 'draft_pick'
  | 'draft_done'
  | 'lucky_pick'
  | 'game_complete';

let ctx: AudioContext | null = null;
let enabled = true;

function loadPref(): void {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === '0') enabled = false;
  } catch { /* ignore */ }
}

loadPref();

function getCtx(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  return ctx;
}

/** Call once; resume AudioContext on first user gesture. */
export function initSFX(): void {
  const resume = () => {
    const c = getCtx();
    if (c?.state === 'suspended') void c.resume();
  };
  document.addEventListener('pointerdown', resume, { once: true, capture: true });
  document.addEventListener('keydown', resume, { once: true, capture: true });
}

export function setSFXEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch { /* ignore */ }
}

export function isSFXEnabled(): boolean {
  return enabled;
}

function envGain(
  c: AudioContext,
  start: number,
  peak: number,
  attack: number,
  decay: number,
  when: number
): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + attack);
  g.gain.exponentialRampToValueAtTime(start, when + attack + decay);
  return g;
}

function playNoiseBurst(duration: number, gain: number): void {
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;

  const when = c.currentTime;
  const bufferSize = c.sampleRate * duration;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.35;

  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = envGain(c, 0.0001, gain, 0.002, duration * 0.85, when);
  src.connect(g);
  g.connect(c.destination);
  src.start(when);
  src.stop(when + duration + 0.02);
}

function playTone(
  freq: number,
  duration: number,
  type: OscillatorType,
  peak: number,
  slideTo?: number
): void {
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;

  const when = c.currentTime;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  if (slideTo != null)
    osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 20), when + duration * 0.85);

  const g = envGain(c, 0.0001, peak, 0.008, duration * 0.75, when);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(when);
  osc.stop(when + duration + 0.03);
}

/** Fire-and-forget one-shot. */
export function playSFX(id: SFXId): void {
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;
  void c.resume();

  switch (id) {
    case 'scratch':
      playNoiseBurst(0.08, 0.12);
      break;
    case 'tick':
      playTone(880, 0.04, 'sine', 0.06);
      setTimeout(() => playTone(660, 0.035, 'sine', 0.045), 45);
      break;
    case 'tile_reveal':
      playTone(220, 0.11, 'triangle', 0.1, 140);
      break;
    case 'word_complete':
      playTone(523, 0.08, 'sine', 0.1);
      setTimeout(() => playTone(659, 0.08, 'sine', 0.09), 70);
      setTimeout(() => playTone(784, 0.14, 'sine', 0.11), 140);
      break;
    case 'draft_pick':
      playTone(440, 0.06, 'square', 0.06, 880);
      break;
    case 'draft_done':
      playTone(392, 0.07, 'triangle', 0.08);
      setTimeout(() => playTone(523, 0.09, 'triangle', 0.09), 80);
      setTimeout(() => playTone(659, 0.12, 'triangle', 0.1), 160);
      break;
    case 'lucky_pick':
      playTone(880, 0.05, 'sine', 0.07);
      setTimeout(() => playTone(1174, 0.06, 'sine', 0.08), 55);
      setTimeout(() => playTone(1568, 0.1, 'sine', 0.07), 110);
      break;
    case 'game_complete':
      playTone(262, 0.1, 'triangle', 0.1);
      setTimeout(() => playTone(330, 0.1, 'triangle', 0.1), 100);
      setTimeout(() => playTone(392, 0.1, 'triangle', 0.1), 200);
      setTimeout(() => playTone(523, 0.25, 'triangle', 0.12), 300);
      break;
    default:
      break;
  }
}
