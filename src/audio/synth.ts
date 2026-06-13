/**
 * Звук — только синтез WebAudio, без аудиофайлов.
 * Низкий дрон-эмбиент, удары, щелчки UI, стинги.
 */
class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneNodes: AudioNode[] = [];
  muted = false;

  private ensure(): AudioContext | null {
    if (typeof AudioContext === 'undefined') return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx)
      this.master.gain.linearRampToValueAtTime(m ? 0 : 0.55, this.ctx.currentTime + 0.2);
    try {
      localStorage.setItem('otr_mute', m ? '1' : '0');
    } catch {
      /* приват-режим */
    }
  }

  loadMuted(): void {
    try {
      this.muted = localStorage.getItem('otr_mute') === '1';
    } catch {
      /* нет localStorage */
    }
  }

  /** низкий дрон-эмбиент */
  startDrone(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.droneNodes.length) return;
    const make = (freq: number, gainV: number, lfoFreq: number) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 140;
      const g = ctx.createGain();
      g.gain.value = gainV;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = lfoFreq;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = gainV * 0.4;
      lfo.connect(lfoGain).connect(g.gain);
      osc.connect(filter).connect(g).connect(this.master!);
      osc.start();
      lfo.start();
      this.droneNodes.push(osc, lfo, g, filter);
    };
    make(48, 0.05, 0.07);
    make(72.2, 0.03, 0.11);
    make(36, 0.04, 0.05);
    // ветер: фильтрованный шум
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 320;
    nf.Q.value = 0.6;
    const ng = ctx.createGain();
    ng.gain.value = 0.018;
    const nlfo = ctx.createOscillator();
    nlfo.frequency.value = 0.13;
    const nlfoG = ctx.createGain();
    nlfoG.gain.value = 0.012;
    nlfo.connect(nlfoG).connect(ng.gain);
    noise.connect(nf).connect(ng).connect(this.master);
    noise.start();
    nlfo.start();
    this.droneNodes.push(noise, nf, ng, nlfo);
  }

  stopDrone(): void {
    for (const n of this.droneNodes) {
      try {
        (n as OscillatorNode).stop?.();
      } catch {
        /* уже остановлен */
      }
      n.disconnect();
    }
    this.droneNodes = [];
  }

  private blip(
    freq: number,
    dur: number,
    type: OscillatorType = 'square',
    vol = 0.2,
    slide = 0,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  private noiseBurst(dur: number, freq: number, vol = 0.3, q = 1): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  uiClick(): void {
    this.blip(640, 0.05, 'square', 0.08);
  }
  uiDeny(): void {
    this.blip(180, 0.12, 'square', 0.1, -60);
  }
  turn(): void {
    this.blip(440, 0.09, 'triangle', 0.1);
    setTimeout(() => this.blip(560, 0.1, 'triangle', 0.09), 70);
  }
  swing(): void {
    this.noiseBurst(0.12, 900, 0.18, 0.8);
  }
  hit(crit: boolean): void {
    this.noiseBurst(0.16, crit ? 500 : 350, 0.4, 1.4);
    this.blip(crit ? 110 : 90, 0.18, 'sawtooth', 0.22, -40);
  }
  miss(): void {
    this.noiseBurst(0.1, 1600, 0.1, 2);
  }
  shoot(): void {
    this.noiseBurst(0.08, 2200, 0.22, 3);
    this.blip(320, 0.07, 'square', 0.08, -180);
  }
  reload(): void {
    this.blip(220, 0.05, 'square', 0.1);
    setTimeout(() => this.blip(300, 0.05, 'square', 0.1), 130);
  }
  explosion(): void {
    this.noiseBurst(0.5, 180, 0.55, 0.7);
    this.blip(60, 0.5, 'sawtooth', 0.3, -30);
  }
  death(): void {
    this.blip(160, 0.4, 'sawtooth', 0.18, -110);
  }
  heal(): void {
    this.blip(520, 0.12, 'sine', 0.12);
    setTimeout(() => this.blip(660, 0.16, 'sine', 0.1), 100);
  }
  door(): void {
    this.noiseBurst(0.2, 240, 0.2, 1.2);
  }
  /** стинг победы/поражения */
  sting(victory: boolean): void {
    const seq = victory ? [392, 523, 659, 784] : [392, 370, 311, 233];
    seq.forEach((f, i) => setTimeout(() => this.blip(f, 0.5, 'triangle', 0.14), i * 180));
  }
}

export const audio = new Synth();
