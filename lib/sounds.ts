"use client";

import { isMuted } from "./soundSettings";

/**
 * 외부 오디오 파일 없이 Web Audio API로 직접 소리를 합성한다.
 * - playTileClack(): 마작패 섞을 때/낼 때 나는 "촤라락" 소리 (여러 개의 짧은 클릭음을 빠르게 겹쳐 재현)
 * - playShuffleSound(): 패 배치(딜) 시 클랙 소리를 여러 번 빠르게 연속 재생
 * - playFanfare(): 라운드 승자 결정 시 작게 울리는 짧은 팡파레
 */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

/** 마작패 한 번 부딪히는 듯한 짧고 딱딱한 "딱" 소리 */
function clack(ctx: AudioContext, when: number, volume = 0.25) {
  // 짧은 화이트노이즈 버스트 + 고역 필터로 "타일이 부딪히는" 질감을 만든다
  const bufferSize = ctx.sampleRate * 0.03; // 30ms
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    // 감쇠하는 노이즈
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = 2200 + Math.random() * 800; // 타일마다 미세하게 음높이 다르게
  bandpass.Q.value = 3;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.05);

  noise.connect(bandpass).connect(gain).connect(ctx.destination);
  noise.start(when);
  noise.stop(when + 0.05);
}

/** 패를 "촤라락" 섞을 때 — 짧은 클랙을 다수 빠르게 겹쳐서 재생 */
export function playShuffleSound(durationMs = 600) {
  if (isMuted()) return;
  const ctx = getCtx();
  const now = ctx.currentTime;
  const clackCount = Math.round(durationMs / 25);
  for (let i = 0; i < clackCount; i++) {
    clack(ctx, now + (i * durationMs) / 1000 / clackCount, 0.12);
  }
}

/** 카드 한 장을 낼 때 — 클랙 1~2번 (자연스럽게 살짝 겹치는 느낌) */
export function playTileClack() {
  if (isMuted()) return;
  const ctx = getCtx();
  const now = ctx.currentTime;
  clack(ctx, now, 0.22);
  clack(ctx, now + 0.02, 0.1);
}

/** 라운드 승자 결정 시 — 작게 울리는 짧은 팡파레 (3화음 아르페지오) */
export function playFanfare() {
  if (isMuted()) return;
  const ctx = getCtx();
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5-E5-G5-C6

  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    const start = now + idx * 0.09;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.12, start + 0.02); // 작게(0.12)
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.4);
  });
}
