/**
 * AudioManager — Procedural Web Audio API soundscape & SFX engine for Astral Command.
 *
 * Features:
 * - Separate Music and SFX gain buses with master limiter/compressor
 * - Independent Music mute, SFX mute, and Master mute support
 * - Browser autoplay unlock handling on first user gesture
 * - Voice concurrency cap & per-category rate limiting for dense 50-unit battles
 * - Procedural atmospheric background music for Hub ('menu'), Battle ('battle'), and Boss ('boss')
 * - Rich synthesized SFX for UI, card draw/select/merge/deploy/invalid, combat, skills, healing,
 *   shields, unit deaths, wave transitions, boss entrance, commander ultimates, summons, and results.
 */

const MENU_ARP_NOTES = [293.66, 349.23, 440.0, 523.25, 587.33, 523.25, 440.0, 392.0]; // D minor celestial
const MENU_BASS_NOTES = [146.83, 146.83, 116.54, 130.81]; // D3, D3, Bb2, C3

const BATTLE_ARP_NOTES = [293.66, 440.0, 349.23, 523.25, 329.63, 440.0, 392.0, 587.33];
const BATTLE_BASS_NOTES = [146.83, 146.83, 174.61, 164.81, 130.81, 130.81, 116.54, 130.81];

const BOSS_ARP_NOTES = [293.66, 311.13, 440.0, 466.16, 349.23, 440.0, 311.13, 293.66];
const BOSS_BASS_NOTES = [110.0, 110.0, 116.54, 110.0, 98.0, 98.0, 116.54, 130.81];

export class AudioManager {
  constructor(gameState, { maxConcurrentVoices = 12 } = {}) {
    this._state = gameState;
    this._ctx = null;
    this._masterGain = null;
    this._musicGain = null;
    this._sfxGain = null;
    this._compressor = null;

    this._maxVoices = maxConcurrentVoices;
    this._activeVoices = 0;
    this._lastPlayTimes = new Map();

    this._bgmMode = null; // 'menu' | 'battle' | 'boss' | null
    this._bgmTimer = null;
    this._bgmStep = 0;
    this._bgmUnlocked = false;
    this._unlockBound = false;

    this._bindAutoplayUnlock();
  }

  _bindAutoplayUnlock() {
    if (this._unlockBound || typeof window === 'undefined') return;
    this._unlockBound = true;
    const unlock = () => {
      this._bgmUnlocked = true;
      const ctx = this._ensureContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      this.syncVolumes();
      if (this._bgmMode && !this._bgmTimer) {
        this._startBgmScheduler();
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true, passive: true });
  }

  _ensureContext() {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this._ctx) {
      this._ctx = new AudioCtx();
      this._compressor = this._ctx.createDynamicsCompressor();
      this._compressor.threshold.value = -16;
      this._compressor.knee.value = 18;
      this._compressor.ratio.value = 6;
      this._compressor.attack.value = 0.005;
      this._compressor.release.value = 0.14;

      this._masterGain = this._ctx.createGain();
      this._musicGain = this._ctx.createGain();
      this._sfxGain = this._ctx.createGain();

      this._musicGain.connect(this._masterGain);
      this._sfxGain.connect(this._masterGain);
      this._masterGain.connect(this._compressor);
      this._compressor.connect(this._ctx.destination);

      this.syncVolumes();
    }

    if (this._ctx.state === 'suspended' && this._bgmUnlocked) {
      this._ctx.resume().catch(() => {});
    }
    return this._ctx;
  }

  getSettings() {
    const s = this._state?.settings || {};
    return {
      musicVolume: typeof s.musicVolume === 'number' ? Math.max(0, Math.min(1, s.musicVolume)) : 0.45,
      sfxVolume: typeof s.sfxVolume === 'number' ? Math.max(0, Math.min(1, s.sfxVolume)) : 0.65,
      muted: Boolean(s.muted),
      musicMuted: Boolean(s.musicMuted),
      sfxMuted: Boolean(s.sfxMuted),
    };
  }

  isSfxEnabled() {
    const s = this.getSettings();
    return !s.muted && !s.sfxMuted && s.sfxVolume > 0.001;
  }

  isMusicEnabled() {
    const s = this.getSettings();
    return !s.muted && !s.musicMuted && s.musicVolume > 0.001;
  }

  getActiveVoiceCount() {
    return this._activeVoices;
  }

  getBgmMode() {
    return this._bgmMode;
  }

  syncVolumes() {
    const s = this.getSettings();
    if (!this._ctx || !this._masterGain || !this._musicGain || !this._sfxGain) return;

    const now = this._ctx.currentTime;
    const masterVal = s.muted ? 0 : 1;
    const musicVal = s.musicMuted ? 0 : s.musicVolume * 0.42;
    const sfxVal = s.sfxMuted ? 0 : s.sfxVolume;

    this._masterGain.gain.setTargetAtTime(masterVal, now, 0.03);
    this._musicGain.gain.setTargetAtTime(musicVal, now, 0.05);
    this._sfxGain.gain.setTargetAtTime(sfxVal, now, 0.02);
  }

  _canPlayCategory(category, minGapMs = 0) {
    if (!this.isSfxEnabled()) return false;
    if (this._activeVoices >= this._maxVoices) return false;
    if (minGapMs > 0) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const prev = this._lastPlayTimes.get(category) || 0;
      if (now - prev < minGapMs) return false;
      this._lastPlayTimes.set(category, now);
    }
    return true;
  }

  _playTone({
    frequency = 440,
    endFrequency = null,
    duration = 0.09,
    type = 'sine',
    gainScale = 0.14,
    delaySec = 0,
    attackSec = 0.006,
    filterFreq = null,
    bus = 'sfx',
  }) {
    if (bus === 'sfx' && !this.isSfxEnabled()) return false;
    if (bus === 'music' && !this.isMusicEnabled()) return false;
    if (bus === 'sfx' && this._activeVoices >= this._maxVoices) return false;

    const ctx = this._ensureContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended' && !this._bgmUnlocked) return false;

    const startTime = ctx.currentTime + Math.max(0, delaySec);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, frequency), startTime);
    if (endFrequency && endFrequency > 20) {
      osc.frequency.exponentialRampToValueAtTime(endFrequency, startTime + duration);
    }

    const peak = Math.max(0.001, gainScale);
    gain.gain.setValueAtTime(0.0005, startTime);
    gain.gain.linearRampToValueAtTime(peak, startTime + Math.min(attackSec, duration * 0.4));
    gain.gain.exponentialRampToValueAtTime(0.0006, startTime + duration);

    let lastNode = osc;
    if (filterFreq) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFreq, startTime);
      lastNode.connect(filter);
      lastNode = filter;
    }

    lastNode.connect(gain);
    gain.connect(bus === 'music' ? this._musicGain : this._sfxGain);

    if (bus === 'sfx') {
      this._activeVoices += 1;
      osc.onended = () => {
        this._activeVoices = Math.max(0, this._activeVoices - 1);
      };
    }

    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
    return true;
  }

  _playNoiseBurst({ duration = 0.07, gainScale = 0.06, filterFreq = 1400, delaySec = 0 } = {}) {
    if (!this.isSfxEnabled() || this._activeVoices >= this._maxVoices) return false;
    const ctx = this._ensureContext();
    if (!ctx || (ctx.state === 'suspended' && !this._bgmUnlocked)) return false;

    const sampleCount = Math.max(128, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 1.2;

    const gain = ctx.createGain();
    const startTime = ctx.currentTime + delaySec;
    gain.gain.setValueAtTime(Math.max(0.001, gainScale), startTime);
    gain.gain.exponentialRampToValueAtTime(0.0005, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this._sfxGain);

    this._activeVoices += 1;
    src.onended = () => {
      this._activeVoices = Math.max(0, this._activeVoices - 1);
    };
    src.start(startTime);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Procedural Background Music (Hub / Battle / Boss)
  // ---------------------------------------------------------------------------

  setBgmMode(mode) {
    if (mode !== 'menu' && mode !== 'battle' && mode !== 'boss') return;
    if (this._bgmMode === mode) return;
    this._bgmMode = mode;
    this._bgmStep = 0;
    this._stopBgmScheduler();
    if (mode && this._bgmUnlocked) {
      this._startBgmScheduler();
    }
  }

  stopBgm() {
    this._bgmMode = null;
    this._stopBgmScheduler();
  }

  _stopBgmScheduler() {
    if (this._bgmTimer !== null) {
      clearInterval(this._bgmTimer);
      this._bgmTimer = null;
    }
  }

  _startBgmScheduler() {
    this._stopBgmScheduler();
    if (typeof window === 'undefined' || !this._bgmMode) return;

    const intervalMs = this._bgmMode === 'menu' ? 680 : this._bgmMode === 'boss' ? 290 : 350;
    this._tickBgm();
    this._bgmTimer = setInterval(() => this._tickBgm(), intervalMs);
  }

  _tickBgm() {
    if (!this._bgmMode || !this.isMusicEnabled() || !this._bgmUnlocked) return;
    if (typeof document !== 'undefined' && document.hidden) return;

    const step = this._bgmStep++;

    if (this._bgmMode === 'menu') {
      const arp = MENU_ARP_NOTES[step % MENU_ARP_NOTES.length];
      this._playTone({
        frequency: arp,
        duration: 0.95,
        type: 'sine',
        gainScale: 0.14,
        attackSec: 0.08,
        filterFreq: 1600,
        bus: 'music',
      });
      if (step % 4 === 0) {
        const bass = MENU_BASS_NOTES[Math.floor(step / 4) % MENU_BASS_NOTES.length];
        this._playTone({
          frequency: bass,
          duration: 2.3,
          type: 'triangle',
          gainScale: 0.16,
          attackSec: 0.15,
          filterFreq: 520,
          bus: 'music',
        });
      }
      if (step % 8 === 0) {
        this._playTone({
          frequency: arp * 1.5,
          duration: 1.4,
          type: 'sine',
          gainScale: 0.07,
          attackSec: 0.12,
          bus: 'music',
        });
      }
      return;
    }

    const isBoss = this._bgmMode === 'boss';
    const arpArr = isBoss ? BOSS_ARP_NOTES : BATTLE_ARP_NOTES;
    const bassArr = isBoss ? BOSS_BASS_NOTES : BATTLE_BASS_NOTES;

    // Rhythmic bassline on even steps
    if (step % 2 === 0) {
      const bass = bassArr[Math.floor(step / 2) % bassArr.length];
      this._playTone({
        frequency: bass,
        endFrequency: bass * 0.98,
        duration: isBoss ? 0.34 : 0.42,
        type: isBoss ? 'sawtooth' : 'triangle',
        gainScale: isBoss ? 0.13 : 0.14,
        attackSec: 0.015,
        filterFreq: isBoss ? 480 : 620,
        bus: 'music',
      });
    }

    // Tactical arpeggio pulse
    const arp = arpArr[step % arpArr.length];
    this._playTone({
      frequency: arp,
      duration: isBoss ? 0.24 : 0.32,
      type: 'triangle',
      gainScale: isBoss ? 0.1 : 0.09,
      attackSec: 0.012,
      filterFreq: 1900,
      bus: 'music',
    });

    // Subtle harmonic shimmer every 4th beat
    if (step % 4 === 2) {
      this._playTone({
        frequency: arp * 1.5,
        duration: 0.45,
        type: 'sine',
        gainScale: 0.055,
        attackSec: 0.03,
        bus: 'music',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // UI & Card Sound Effects
  // ---------------------------------------------------------------------------

  playClick() {
    if (!this._canPlayCategory('click', 35)) return;
    this._playTone({ frequency: 560, endFrequency: 740, duration: 0.05, type: 'triangle', gainScale: 0.1 });
  }

  playCardSelect() {
    if (!this._canPlayCategory('card_select', 40)) return;
    this._playTone({ frequency: 480, endFrequency: 720, duration: 0.065, type: 'sine', gainScale: 0.11 });
    this._playTone({ frequency: 720, endFrequency: 960, duration: 0.06, type: 'triangle', gainScale: 0.06, delaySec: 0.025 });
  }

  playCardDraw() {
    if (!this._canPlayCategory('card_draw', 50)) return;
    this._playNoiseBurst({ duration: 0.065, gainScale: 0.05, filterFreq: 2400 });
    this._playTone({ frequency: 620, endFrequency: 880, duration: 0.075, type: 'sine', gainScale: 0.065, delaySec: 0.02 });
  }

  playInvalid() {
    if (!this._canPlayCategory('invalid', 90)) return;
    this._playTone({ frequency: 210, endFrequency: 150, duration: 0.09, type: 'sawtooth', gainScale: 0.09, filterFreq: 750 });
    this._playTone({ frequency: 175, endFrequency: 130, duration: 0.1, type: 'sawtooth', gainScale: 0.08, delaySec: 0.07, filterFreq: 680 });
  }

  playDeploy() {
    if (!this._canPlayCategory('deploy', 60)) return;
    this._playTone({ frequency: 320, endFrequency: 580, duration: 0.11, type: 'triangle', gainScale: 0.13 });
    this._playTone({ frequency: 640, endFrequency: 880, duration: 0.09, type: 'sine', gainScale: 0.08, delaySec: 0.04 });
  }

  playMerge(tier = 2) {
    if (!this._canPlayCategory('merge', 80)) return;
    const isMax = tier >= 3;
    const notes = isMax ? [523.25, 659.25, 783.99, 1046.5] : [440, 554.37, 659.25];
    notes.forEach((freq, i) => {
      this._playTone({
        frequency: freq,
        endFrequency: freq * 1.04,
        duration: isMax ? 0.24 : 0.16,
        type: i === notes.length - 1 ? 'sine' : 'triangle',
        gainScale: isMax ? 0.14 : 0.12,
        delaySec: i * 0.055,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Combat, Skill, Healing, Boss & Commander Ultimate Sound Effects
  // ---------------------------------------------------------------------------

  playProjectile() {
    if (!this._canPlayCategory('projectile', 75)) return;
    this._playTone({ frequency: 740, endFrequency: 420, duration: 0.065, type: 'sine', gainScale: 0.055 });
  }

  playHit(isCrit = false, attackType = 'physical') {
    if (!this._canPlayCategory(isCrit ? 'crit_hit' : 'hit', isCrit ? 45 : 70)) return;
    if (isCrit) {
      this._playTone({ frequency: 380, endFrequency: 120, duration: 0.12, type: 'sawtooth', gainScale: 0.1, filterFreq: 1400 });
      this._playTone({ frequency: 920, endFrequency: 1280, duration: 0.08, type: 'triangle', gainScale: 0.075, delaySec: 0.02 });
    } else if (attackType === 'magical') {
      this._playTone({ frequency: 440, endFrequency: 240, duration: 0.075, type: 'triangle', gainScale: 0.065, filterFreq: 1600 });
    } else {
      this._playNoiseBurst({ duration: 0.05, gainScale: 0.045, filterFreq: 950 });
      this._playTone({ frequency: 190, endFrequency: 85, duration: 0.06, type: 'square', gainScale: 0.048, filterFreq: 800 });
    }
  }

  playSkill() {
    if (!this._canPlayCategory('skill', 75)) return;
    this._playTone({ frequency: 660, endFrequency: 310, duration: 0.22, type: 'sawtooth', gainScale: 0.095, filterFreq: 1800 });
    this._playTone({ frequency: 880, endFrequency: 1320, duration: 0.16, type: 'sine', gainScale: 0.08, delaySec: 0.05 });
  }

  playHeal() {
    if (!this._canPlayCategory('heal', 90)) return;
    this._playTone({ frequency: 587.33, endFrequency: 880, duration: 0.16, type: 'sine', gainScale: 0.075 });
    this._playTone({ frequency: 783.99, endFrequency: 1174.66, duration: 0.14, type: 'sine', gainScale: 0.055, delaySec: 0.05 });
  }

  playShield() {
    if (!this._canPlayCategory('shield', 90)) return;
    this._playTone({ frequency: 392, endFrequency: 587.33, duration: 0.14, type: 'triangle', gainScale: 0.08 });
  }

  playUnitDeath(isBoss = false) {
    if (!this._canPlayCategory(isBoss ? 'boss_death' : 'death', isBoss ? 0 : 95)) return;
    if (isBoss) {
      this._playNoiseBurst({ duration: 0.35, gainScale: 0.12, filterFreq: 520 });
      this._playTone({ frequency: 180, endFrequency: 48, duration: 0.45, type: 'sawtooth', gainScale: 0.16, filterFreq: 600 });
      this._playTone({ frequency: 523.25, endFrequency: 1046.5, duration: 0.3, type: 'triangle', gainScale: 0.11, delaySec: 0.22 });
    } else {
      this._playTone({ frequency: 240, endFrequency: 92, duration: 0.1, type: 'triangle', gainScale: 0.055, filterFreq: 900 });
    }
  }

  playWave() {
    if (!this._canPlayCategory('wave', 120)) return;
    this._playTone({ frequency: 293.66, endFrequency: 440, duration: 0.22, type: 'triangle', gainScale: 0.11 });
    this._playTone({ frequency: 440, endFrequency: 587.33, duration: 0.24, type: 'sine', gainScale: 0.09, delaySec: 0.12 });
  }

  playBossEntrance() {
    if (!this._canPlayCategory('boss_entrance', 250)) return;
    this._playTone({ frequency: 146.83, endFrequency: 98.0, duration: 0.52, type: 'sawtooth', gainScale: 0.15, filterFreq: 520 });
    this._playTone({ frequency: 220.0, endFrequency: 146.83, duration: 0.42, type: 'sawtooth', gainScale: 0.11, delaySec: 0.14, filterFreq: 780 });
    this._playNoiseBurst({ duration: 0.24, gainScale: 0.08, filterFreq: 420, delaySec: 0.06 });
  }

  playUltimate() {
    if (!this._canPlayCategory('ultimate', 200)) return;
    this._playTone({ frequency: 220, endFrequency: 587.33, duration: 0.32, type: 'sawtooth', gainScale: 0.12, filterFreq: 1600 });
    this._playTone({ frequency: 587.33, endFrequency: 880, duration: 0.32, type: 'triangle', gainScale: 0.13, delaySec: 0.12 });
    this._playTone({ frequency: 880, endFrequency: 1174.66, duration: 0.38, type: 'sine', gainScale: 0.14, delaySec: 0.24 });
  }

  playVictory() {
    if (!this.isSfxEnabled()) return;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, idx) => {
      this._playTone({
        frequency: freq,
        duration: idx === 4 ? 0.42 : 0.2,
        type: idx === 4 ? 'sine' : 'triangle',
        gainScale: 0.13,
        delaySec: idx * 0.09,
      });
    });
  }

  playDefeat() {
    if (!this.isSfxEnabled()) return;
    [349.23, 311.13, 277.18, 220.0].forEach((freq, idx) => {
      this._playTone({
        frequency: freq,
        duration: idx === 3 ? 0.42 : 0.22,
        type: 'sine',
        gainScale: 0.11,
        delaySec: idx * 0.12,
      });
    });
  }

  playSummon(rarityOrHigh = false) {
    if (!this.isSfxEnabled()) return;
    const isSSR = rarityOrHigh === 'SSR';
    const isHigh = isSSR || rarityOrHigh === 'SR' || rarityOrHigh === true;

    if (isSSR) {
      [523.25, 659.25, 783.99, 1046.5, 1567.98].forEach((freq, idx) => {
        this._playTone({
          frequency: freq,
          duration: idx === 4 ? 0.45 : 0.2,
          type: idx % 2 === 0 ? 'triangle' : 'sine',
          gainScale: 0.14,
          delaySec: idx * 0.075,
        });
      });
    } else if (isHigh) {
      [440, 587.33, 880].forEach((freq, idx) => {
        this._playTone({
          frequency: freq,
          duration: 0.22,
          type: 'triangle',
          gainScale: 0.12,
          delaySec: idx * 0.08,
        });
      });
    } else {
      this._playTone({
        frequency: 392,
        endFrequency: 587.33,
        duration: 0.18,
        type: 'triangle',
        gainScale: 0.11,
      });
    }
  }

  playReward() {
    if (!this._canPlayCategory('reward', 100)) return;
    this._playTone({ frequency: 659.25, endFrequency: 987.77, duration: 0.14, type: 'sine', gainScale: 0.1 });
    this._playTone({ frequency: 987.77, endFrequency: 1318.5, duration: 0.18, type: 'triangle', gainScale: 0.09, delaySec: 0.07 });
  }
}
