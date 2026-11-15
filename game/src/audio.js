// Sound, all synthesized with the Web Audio API — no audio files. Gunfire
// is filtered noise with a fast decay, steps are a short click, the charge
// is a rising tone, UI clicks are oscillator blips. Distant gunfire is
// quieter; a shot the player hears is also a sound a bot could hear.
export function createAudio() {
  let ctx = null;
  let master = null;
  const listener = { x: 0, y: 0, z: 0 };

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    return ctx;
  }

  function noiseBuffer(duration) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst(x, y, z, volume, cutoff, duration) {
    if (!ensure()) return;
    const distance = Math.hypot(x - listener.x, y - listener.y, z - listener.z);
    const gain = volume * Math.max(0.05, 1 / (1 + distance * 0.06));
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(gain, ctx.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    source.start();
    source.stop(ctx.currentTime + duration);
  }

  function tone(x, y, z, frequency, duration, volume = 0.15, type = 'sine') {
    if (!ensure()) return;
    const distance = Math.hypot(x - listener.x, y - listener.y, z - listener.z);
    const gain = volume * Math.max(0.05, 1 / (1 + distance * 0.06));
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(gain, ctx.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(envelope);
    envelope.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  function click(frequency = 880, duration = 0.08, volume = 0.2) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = frequency;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(volume, ctx.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(envelope);
    envelope.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  return {
    unlock() { ensure(); },
    setListener(x, y, z) { listener.x = x; listener.y = y; listener.z = z; },
    shot(x, y, z, heavy = false) { burst(x, y, z, heavy ? 0.9 : 0.6, heavy ? 700 : 1200, heavy ? 0.28 : 0.14); },
    explosion(x, y, z) { burst(x, y, z, 1.2, 300, 0.9); tone(x, y, z, 60, 0.6, 0.5, 'sine'); },
    step(x, y, z) { burst(x, y, z, 0.12, 500, 0.05); },
    reload(x, y, z) { tone(x, y, z, 420, 0.12, 0.12, 'triangle'); },
    beep(x, y, z) { tone(x, y, z, 1400, 0.1, 0.25, 'square'); },
    plant(x, y, z) { tone(x, y, z, 300, 0.5, 0.25, 'triangle'); tone(x, y, z, 600, 0.3, 0.2, 'triangle'); },
    defuse(x, y, z) { tone(x, y, z, 600, 0.4, 0.2, 'triangle'); tone(x, y, z, 300, 0.3, 0.15, 'triangle'); },
    hit() { click(1200, 0.05, 0.15); },
    kill() { click(1600, 0.1, 0.2); },
    buy() { click(880, 0.08, 0.2); },
    denied() { click(220, 0.15, 0.2); },
    round() { click(660, 0.2, 0.25); click(990, 0.3, 0.25); },
  };
}
