"use client";

import type { PlayerCount } from "@/lib/lexioEngine";
import type { PlayLogEntry } from "@/lib/playLog";
import LexioCard, { type CardTheme } from "./LexioCard";

/**
 * 이번 라운드에 나온 패를 "바닥에 깔린 그대로" 계속 보여준다 (손패처럼 실제 카드 타일로).
 * 낸 순서대로 카드가 그대로 쌓이고, 라운드가 끝나면 초기화된다.
 */
export default function PlayHistoryStrip({
  entries,
  theme = "dark",
}: {
  entries: PlayLogEntry[];
  playerCount: PlayerCount;
  theme?: CardTheme;
}) {
  if (entries.length === 0) return null;
  const allCards = entries.flatMap((e) => e.cards);

  return (
    <div style={{ padding: "0 16px" }}>
      <p style={{ fontSize: 10, opacity: 0.4, margin: "0 0 4px" }}>이번 라운드에 나온 패</p>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
        }}
      >
        {allCards.map((c, i) => (
          <LexioCard key={i} card={c} theme={theme} small />
        ))}
      </div>
    </div>
  );
}
