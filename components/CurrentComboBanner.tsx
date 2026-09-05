"use client";

import type { HandEval } from "@/lib/lexioEngine";
import { formatCombo } from "@/lib/comboFormat";
import LexioCard, { type CardTheme } from "./LexioCard";

export default function CurrentComboBanner({
  lastPlay,
  theme = "dark",
  hidden = false,
}: {
  lastPlay: { nickname: string; hand: HandEval } | null;
  theme?: CardTheme;
  hidden?: boolean;
}) {
  return (
    <div
      style={{
        margin: "12px 16px",
        padding: 14,
        borderRadius: 14,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        minHeight: 90,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      {hidden ? (
        <p style={{ fontSize: 13, opacity: 0.4, margin: 0 }}>⏸ 일시정지 중이에요</p>
      ) : !lastPlay ? (
        <p style={{ fontSize: 13, opacity: 0.4, margin: 0 }}>
          아직 아무도 내지 않았어요. 원하는 패를 먼저 내주세요.
        </p>
      ) : (
        <>
          <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>{lastPlay.nickname}님이 냈어요</p>
          <div style={{ display: "flex", gap: 4 }}>
            {lastPlay.hand.cards.map((c, i) => (
              <LexioCard key={i} card={c} theme={theme} small />
            ))}
          </div>
          <p style={{ fontSize: 15, fontWeight: 800, margin: 0, color: "#e0304a" }}>
            {formatCombo(lastPlay.hand)}
          </p>
        </>
      )}
    </div>
  );
}
