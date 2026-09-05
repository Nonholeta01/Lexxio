"use client";

import { Suit, type Card } from "@/lib/lexioEngine";

export type CardTheme = "dark" | "light";

const SUIT_COLOR: Record<Suit, string> = {
  [Suit.Cloud]: "#4a90e2", // 구름 - 파랑
  [Suit.Star]: "#f2c14e", // 별 - 노랑
  [Suit.Moon]: "#4caf6d", // 달 - 초록
  [Suit.Sun]: "#e0304a", // 해 - 빨강
};

const SUIT_ICON: Record<Suit, string> = {
  [Suit.Cloud]: "☁",
  [Suit.Star]: "★",
  [Suit.Moon]: "☾",
  [Suit.Sun]: "☀",
};

export default function LexioCard({
  card,
  selected = false,
  onClick,
  theme = "dark",
  small = false,
  /** 실측(px)으로 폭을 강제 지정 — 지정하면 이 값을 그대로 씀 (절대 넘치지 않음을 보장하는 용도) */
  widthPx,
}: {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  theme?: CardTheme;
  small?: boolean;
  widthPx?: number;
}) {
  const color = SUIT_COLOR[card.suit];
  const isDark = theme === "dark";

  // 실제 마작패(두꺼운 몸통 + 광택)를 흉내: 몸통은 무채색(상아색/검정), 숫자·문양만 색으로 구분
  const faceColor = isDark ? "#202024" : "#fbfaf6";
  const edgeColor = isDark ? "#050506" : "#c7c3ba";

  const width = widthPx ?? (small ? 34 : 42);
  const height = Math.round(width / 0.72);
  const numberFontSize = width <= 26 ? 9 : width <= 32 ? 10 : small ? 12 : 15;
  const suitFontSize = width <= 26 ? 12 : width <= 32 ? 13 : small ? 14 : 18;

  return (
    <button
      onClick={onClick}
      style={{
        width,
        height,
        flexShrink: 0,
        position: "relative",
        padding: 0,
        overflow: "hidden",
        borderRadius: 6,
        border: "none",
        background: faceColor,
        boxShadow: selected
          ? `0 1px 0 ${edgeColor}, 0 8px 12px rgba(0,0,0,0.45), 0 0 0 2px ${color}`
          : `0 3px 0 ${edgeColor}, 0 4px 5px rgba(0,0,0,0.4)`,
        transform: selected ? "translateY(-11px)" : "translateY(0)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {/* 위쪽 광택 하이라이트 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: isDark
            ? "linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 45%)"
            : "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 45%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
          color,
        }}
      >
        <span style={{ fontSize: numberFontSize, fontWeight: 800 }}>{card.number}</span>
        <span style={{ fontSize: suitFontSize, lineHeight: 1 }}>{SUIT_ICON[card.suit]}</span>
      </div>
    </button>
  );
}
