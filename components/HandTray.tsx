"use client";

import { useEffect, useRef, useState } from "react";
import type { Card } from "@/lib/lexioEngine";
import { cardId } from "@/lib/lexioEngine";
import LexioCard, { type CardTheme } from "./LexioCard";

const MAX_TILE_WIDTH = 34; // 넘지 않을 최대 폭(px) — 자리가 부족하면 실측해서 이보다 더 줄임
const ROW_GAP = 4;
const ROW_PADDING_X = 10; // 좌우 각각

export default function HandTray({
  hand,
  theme = "dark",
  disabled = false,
  hidden = false,
  onPlay,
  onPass,
  onArmedChange,
  secondsLeft,
}: {
  hand: Card[];
  theme?: CardTheme;
  disabled?: boolean;
  /** 일시정지 중 등 — 패를 뒷면으로 가려야 할 때 */
  hidden?: boolean;
  onPlay: (selected: Card[]) => void;
  onPass: () => void;
  /** "내기"를 한 번 눌러 확정 대기 상태가 될 때마다 그 카드들을(해제되면 null) 부모에 알려줌
   * — 부모는 이 값을 갖고 있다가 시간이 다 되면 대신 제출시킨다 */
  onArmedChange?: (armedCards: Card[] | null) => void;
  /** 남은 턴 제한시간(초) — 내기 버튼에 실시간으로 표시 */
  secondsLeft?: number | null;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [armed, setArmed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tileWidth, setTileWidth] = useState(MAX_TILE_WIDTH);

  const sorted = [...hand].sort((a, b) => a.number - b.number || a.suit - b.suit);
  const topCount = Math.ceil(sorted.length / 2);
  const topRow = sorted.slice(0, topCount);
  const bottomRow = sorted.slice(topCount);
  const maxCols = Math.max(topRow.length, bottomRow.length, 1);

  // 컨테이너의 실제 픽셀 폭을 재서, 그 폭 안에 maxCols장이 확실히 들어가는 크기를 계산.
  // CSS만으로는 브라우저/상황에 따라 어긋날 수 있어 실측 + 강제 px 지정으로 100% 보장한다.
  useEffect(() => {
    function recompute() {
      const el = containerRef.current;
      if (!el) return;
      const available = el.clientWidth - ROW_PADDING_X * 2;
      const raw = (available - ROW_GAP * (maxCols - 1)) / maxCols;
      setTileWidth(Math.max(18, Math.min(MAX_TILE_WIDTH, Math.floor(raw))));
    }
    recompute();
    const ro = new ResizeObserver(recompute);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [maxCols]);

  // 내 차례가 아니게 되면(제출/패스/타임아웃 등으로 턴이 넘어가면) 선택 상태 초기화
  useEffect(() => {
    if (disabled) {
      setSelectedIds(new Set());
      setArmed(false);
    }
  }, [disabled]);

  function toggle(card: Card) {
    if (disabled) return;
    const id = cardId(card);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // 카드 선택을 바꾸면 확정 대기 상태는 취소 (다시 확인하라는 의미)
    if (armed) {
      setArmed(false);
      onArmedChange?.(null);
    }
  }

  function handlePlayButton() {
    const selected = hand.filter((c) => selectedIds.has(cardId(c)));
    if (selected.length === 0) return;

    if (!armed) {
      // 1차 클릭: 바로 내지 않고 "한 번 더 눌러 확정" 상태로 전환
      setArmed(true);
      onArmedChange?.(selected);
      return;
    }

    // 2차 클릭: 실제로 제출
    onPlay(selected);
    setSelectedIds(new Set());
    setArmed(false);
    onArmedChange?.(null);
  }

  function handlePass() {
    setSelectedIds(new Set());
    setArmed(false);
    onArmedChange?.(null);
    onPass();
  }

  const selectedCount = selectedIds.size;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        ref={containerRef}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 5,
          padding: `16px ${ROW_PADDING_X}px 4px`,
        }}
      >
        <CardRow
          cards={topRow}
          hidden={hidden}
          theme={theme}
          tileWidth={tileWidth}
          selectedIds={selectedIds}
          onToggle={toggle}
        />
        {bottomRow.length > 0 && (
          <CardRow
            cards={bottomRow}
            hidden={hidden}
            theme={theme}
            tileWidth={tileWidth}
            selectedIds={selectedIds}
            onToggle={toggle}
          />
        )}
      </div>

      <div style={{ display: "flex", gap: 8, padding: "0 12px 12px" }}>
        <button
          onClick={handlePass}
          disabled={disabled}
          style={{
            flex: 1,
            padding: "12px 0",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "transparent",
            color: "#fff",
            fontWeight: 700,
            opacity: disabled ? 0.4 : 1,
          }}
        >
          패스
        </button>
        <button
          onClick={handlePlayButton}
          disabled={disabled || selectedCount === 0}
          style={{
            flex: 2,
            padding: "12px 0",
            borderRadius: 12,
            border: "none",
            background: armed ? "#ff5470" : "#e0304a",
            color: "#fff",
            fontWeight: 800,
            opacity: disabled || selectedCount === 0 ? 0.4 : 1,
            boxShadow: armed ? "0 0 0 2px rgba(255,255,255,0.5)" : "none",
          }}
        >
          {armed
            ? "다시 눌러 확정!"
            : `내기 ${selectedCount > 0 ? `(${selectedCount}장)` : ""}${
                !disabled && secondsLeft !== null && secondsLeft !== undefined ? ` · ${secondsLeft}s` : ""
              }`}
        </button>
      </div>
    </div>
  );
}

/** 한 줄 — 실측으로 계산된 고정 px 폭으로 카드를 그림 (절대 넘치지 않음) */
function CardRow({
  cards,
  hidden,
  theme,
  tileWidth,
  selectedIds,
  onToggle,
}: {
  cards: Card[];
  hidden: boolean;
  theme: CardTheme;
  tileWidth: number;
  selectedIds: Set<string>;
  onToggle: (card: Card) => void;
}) {
  if (cards.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: ROW_GAP, justifyContent: "center" }}>
      {hidden
        ? cards.map((card) => <CardBack key={cardId(card)} theme={theme} widthPx={tileWidth} />)
        : cards.map((card) => (
            <LexioCard
              key={cardId(card)}
              card={card}
              theme={theme}
              widthPx={tileWidth}
              selected={selectedIds.has(cardId(card))}
              onClick={() => onToggle(card)}
            />
          ))}
    </div>
  );
}

function CardBack({ theme, widthPx }: { theme: CardTheme; widthPx: number }) {
  const isDark = theme === "dark";
  const edgeColor = isDark ? "#050506" : "#c7c3ba";
  return (
    <div
      style={{
        width: widthPx,
        height: Math.round(widthPx / 0.72),
        flexShrink: 0,
        borderRadius: 6,
        background: isDark
          ? "repeating-linear-gradient(45deg, #1a1a1e, #1a1a1e 4px, #232327 4px, #232327 8px)"
          : "repeating-linear-gradient(45deg, #f0efe9, #f0efe9 4px, #e4e2da 4px, #e4e2da 8px)",
        boxShadow: `0 3px 0 ${edgeColor}, 0 4px 5px rgba(0,0,0,0.35)`,
      }}
    />
  );
}
