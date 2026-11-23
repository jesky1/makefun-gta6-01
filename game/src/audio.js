// Procedural WebAudio for Caldera Heat: no audio files. Engine hum, gunshots,
// pickups, cash register blips and a two-tone siren are all synthesised.
export function createAudio() {
  let ctx = null, engineOsc = null, engineGain = null, sirenOsc = null, sirenGain = null;
  let muted = false;
  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      engineOsc = ctx.createOscillator();
      engineGain = ctx.createGain();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain).connect(ctx.destination);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenGain = ctx.createGain();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(ctx.destination);
      sirenOsc.start();
      return true;
    } catch { return false; }
  }
  function blip(freq, dur, type, vol, slideTo) {
    if (muted || !ensure()) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  }
  return {
    unlock() { ensure(); },
    shot() { blip(220, 0.12, 'square', 0.16, 55); },
    pickup() { blip(660, 0.14, 'sine', 0.14, 990); },
    cash() { blip(880, 0.1, 'sine', 0.12); setTimeout(() => blip(1320, 0.14, 'sine', 0.12), 60); },
    mission() { blip(523, 0.16, 'triangle', 0.14); setTimeout(() => blip(784, 0.22, 'triangle', 0.14), 110); },
    bust() { blip(320, 0.5, 'sawtooth', 0.14, 90); },
    setEngine(speedRatio, driving) {
      if (muted || !ctx) return;
      const target = driving ? 0.05 : 0.0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + Math.abs(speedRatio) * 130, ctx.currentTime, 0.1);
    },
    setSiren(on, tick) {
      if (muted || !ctx) return;
      sirenGain.gain.setTargetAtTime(on ? 0.028 : 0.0, ctx.currentTime, 0.15);
      if (on) sirenOsc.frequency.setTargetAtTime(tick % 40 < 20 ? 720 : 540, ctx.currentTime, 0.05);
    },
    toggleMute() { muted = !muted; if (ctx && muted) { engineGain.gain.value = 0; sirenGain.gain.value = 0; } return muted; },
    get muted() { return muted; },
  };
}
