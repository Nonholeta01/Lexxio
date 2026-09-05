"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
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
  // 5장 조합(스트레이트~스트레이트플러시)이 새로 나올 때마다 살짝 터지는 이펙트를 재생
  const [burstKey, setBurstKey] = useState(0);
  const lastSignatureRef = useRef<string | null>(null);

  const playSignature = lastPlay
    ? `${lastPlay.nickname}-${lastPlay.hand.cards.map((c) => `${c.number}.${c.suit}`).join(",")}`
    : "none";

  useEffect(() => {
    if (!lastPlay) {
      lastSignatureRef.current = null;
      return;
    }
    const signature = lastPlay.hand.cards.map((c) => `${c.number}-${c.suit}`).join(",");
    if (lastPlay.hand.count === 5 && signature !== lastSignatureRef.current) {
      setBurstKey((k) => k + 1);
    }
    lastSignatureRef.current = signature;
  }, [lastPlay]);

  return (
    <div
      key={burstKey}
      className={lastPlay && lastPlay.hand.count === 5 ? "lexio-combo-burst" : undefined}
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
        <motion.div
          key={playSignature}
          initial={{ opacity: 0, y: -16, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
        >
          <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>{lastPlay.nickname}님이 냈어요</p>
          <div style={{ display: "flex", gap: 4 }}>
            {lastPlay.hand.cards.map((c, i) => (
              <LexioCard key={i} card={c} theme={theme} small />
            ))}
          </div>
          <p style={{ fontSize: 15, fontWeight: 800, margin: 0, color: "#e0304a" }}>
            {formatCombo(lastPlay.hand)}
          </p>
        </motion.div>
      )}
    </div>
  );
}
