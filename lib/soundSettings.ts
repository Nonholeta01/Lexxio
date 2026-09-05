"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "lexio_sound_muted";
const EVENT_NAME = "lexio-sound-mute-changed";

export function isMuted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function setMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: muted }));
}

/** 우측하단 스피커 버튼 등에서 사용 — 현재 음소거 상태 + 토글 함수 */
export function useSoundMuted(): [boolean, () => void] {
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    setMutedState(isMuted());
    const handler = (e: Event) => setMutedState((e as CustomEvent<boolean>).detail);
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  function toggle() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }

  return [muted, toggle];
}
