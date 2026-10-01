/**
 * Bildirim ve mesaj sesleri. Ses dosyası indirilmez; kısa, yumuşak tonlar Web Audio ile üretilir.
 * Tarayıcılar sesi ancak ilk tıklamadan sonra çalmaya izin verir; tercih bu cihazda saklanır.
 */
const KEY = 'forum_sound';

class Sounds {
  enabled = $state(true);
  private ctx: AudioContext | null = null;
  private armed = false;

  init(): void {
    try {
      this.enabled = localStorage.getItem(KEY) !== 'off';
    } catch {
      /* depolama kapalı */
    }
    if (this.armed || typeof window === 'undefined') return;
    this.armed = true;
    const unlock = () => {
      this.context()?.resume().catch(() => undefined);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  toggle(on = !this.enabled): void {
    this.enabled = on;
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      /* yoksay */
    }
    if (on) this.play('notification');
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    return this.ctx;
  }

  /** notification: iki notalı zil; message: yumuşak "pıt" sesi */
  play(kind: 'notification' | 'message'): void {
    if (!this.enabled) return;
    const ctx = this.context();
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const tone = (start: number, from: number, to: number, length: number, volume: number, type: OscillatorType = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, now + start);
      osc.frequency.exponentialRampToValueAtTime(to, now + start + length * 0.6);
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(volume, now + start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + length);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + length + 0.02);
    };
    if (kind === 'notification') {
      tone(0, 880, 880, 0.22, 0.09, 'triangle');
      tone(0.12, 1318.5, 1318.5, 0.32, 0.08, 'triangle');
    } else {
      tone(0, 540, 820, 0.12, 0.12);
      tone(0.11, 700, 1040, 0.16, 0.09);
    }
  }
}

export const sounds = new Sounds();
