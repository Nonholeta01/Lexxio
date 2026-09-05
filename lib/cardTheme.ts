"use client";

import { useEffect, useState } from "react";
import type { CardTheme } from "@/components/LexioCard";

const STORAGE_KEY = "lexio_card_theme";
const EVENT_NAME = "lexio-card-theme-changed";

export function getCardTheme(): CardTheme {
  if (typeof window === "undefined") return "dark";
  return (window.localStorage.getItem(STORAGE_KEY) as CardTheme) || "dark";
}

export function setCardTheme(theme: CardTheme): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, theme);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: theme }));
}

/** 게임 화면 등에서 사용 — 현재 패 스킨 + 토글 함수 */
export function useCardTheme(): [CardTheme, () => void] {
  const [theme, setThemeState] = useState<CardTheme>("dark");

  useEffect(() => {
    setThemeState(getCardTheme());
    const handler = (e: Event) => setThemeState((e as CustomEvent<CardTheme>).detail);
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  function toggle() {
    const next: CardTheme = theme === "dark" ? "light" : "dark";
    setCardTheme(next);
    setThemeState(next);
  }

  return [theme, toggle];
}
