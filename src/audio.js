export class MachineAudio {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.master = null;
    this.motor = null;
    this.motorGain = null;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled && this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, .03);
    if (enabled && this.master) this.master.gain.setTargetAtTime(.42, this.ctx.currentTime, .03);
  }

  ensure() {
    if (!this.enabled) return false;
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = .42;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  tone(freq, duration, { type = 'sine', gain = .16, endFreq = freq, delay = 0 } = {}) {
    if (!this.ensure()) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    amp.gain.setValueAtTime(.0001, now);
    amp.gain.exponentialRampToValueAtTime(gain, now + .012);
    amp.gain.exponentialRampToValueAtTime(.0001, now + duration);
    osc.connect(amp); amp.connect(this.master);
    osc.start(now); osc.stop(now + duration + .02);
  }

  noise(duration = .08, gain = .08, delay = 0) {
    if (!this.ensure()) return;
    const sampleRate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, Math.ceil(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const amp = this.ctx.createGain();
    filter.type = 'bandpass'; filter.frequency.value = 1500; filter.Q.value = .8;
    amp.gain.value = gain;
    src.buffer = buffer; src.connect(filter); filter.connect(amp); amp.connect(this.master);
    src.start(this.ctx.currentTime + delay);
  }

  coin() {
    this.tone(1150, .055, { type: 'square', gain: .12 });
    this.tone(1750, .1, { type: 'sine', gain: .11, delay: .07 });
  }

  relay(count = 2) {
    for (let index = 0; index < count; index += 1) {
      this.noise(.035, .038, index * .052);
      this.tone(118 + index * 17, .045, { type: 'square', gain: .045, endFreq: 92, delay: index * .052 });
    }
  }

  receipt(approved = true) {
    this.noise(.34, .035);
    this.tone(approved ? 620 : 180, .12, {
      type: 'square',
      gain: .055,
      endFreq: approved ? 780 : 112,
      delay: .22,
    });
  }

  lever() {
    this.noise(.12, .08);
    this.tone(86, .16, { type: 'sawtooth', gain: .09, endFreq: 48 });
  }

  startMotor() {
    if (!this.ensure() || this.motor) return;
    const osc = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const amp = this.ctx.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = 74;
    mod.type = 'square'; mod.frequency.value = 21; modGain.gain.value = 8;
    mod.connect(modGain); modGain.connect(osc.frequency);
    amp.gain.setValueAtTime(.0001, this.ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(.055, this.ctx.currentTime + .08);
    osc.connect(amp); amp.connect(this.master);
    osc.start(); mod.start();
    this.motor = { osc, mod };
    this.motorGain = amp;
  }

  stopMotor() {
    if (!this.motor) return;
    const now = this.ctx.currentTime;
    this.motorGain.gain.cancelScheduledValues(now);
    this.motorGain.gain.setValueAtTime(Math.max(.0001, this.motorGain.gain.value), now);
    this.motorGain.gain.exponentialRampToValueAtTime(.0001, now + .14);
    this.motor.osc.stop(now + .16); this.motor.mod.stop(now + .16);
    this.motor = null; this.motorGain = null;
  }

  reelStop(index) {
    this.noise(.07, .065, index * .005);
    this.tone(170 - index * 18, .11, { type: 'square', gain: .1, endFreq: 95 });
  }

  lose() {
    this.tone(150, .22, { type: 'triangle', gain: .08, endFreq: 86 });
  }

  win(amount, jackpot = false) {
    const notes = amount >= 100 ? [523, 659, 784, 1047, 1319] : [392, 523, 659, 784];
    notes.forEach((freq, i) => this.tone(freq, .28, { type: 'square', gain: .095, delay: i * .09 }));
    if (amount >= 100) this.tone(131, .72, { type: 'sawtooth', gain: .08, endFreq: 262, delay: .08 });
    if (jackpot) {
      [1047, 1319, 1568, 2093].forEach((freq, i) => this.tone(freq, .52, { type: 'triangle', gain: .075, delay: .48 + i * .13 }));
      this.tone(82, 1.1, { type: 'sawtooth', gain: .065, endFreq: 164, delay: .36 });
    }
  }
}
