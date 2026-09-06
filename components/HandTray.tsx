"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Card } from "@/lib/lexioEngine";
import { cardId } from "@/lib/lexioEngine";
import LexioCard, { type CardTheme } from "./LexioCard";

const MAX_TILE_WIDTH = 34; // 넘지 않을 최대 폭(px) — 자리가 부족하면 실측해서 이보다 더 줄임
const ROW_GAP = 4;
const ROW_PADDING_X = 10; // 좌우 각각

type SortMode = "number" | "suit" | "custom";

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
  const [sortMode, setSortMode] = useState<SortMode>("number");
  const [customOrderIds, setCustomOrderIds] = useState<string[]>([]);

  const numberSorted = [...hand].sort((a, b) => a.number - b.number || a.suit - b.suit);
  const suitSorted = [...hand].sort((a, b) => a.suit - b.suit || a.number - b.number);

  // "내맘대로" 순서는 손패가 바뀔 때마다(카드 내기 등) 유지하되, 없어진 카드는 빼고
  // 새로 생긴 카드(새 라운드 등)는 뒤에 붙여서 계속 맞춰준다.
  useEffect(() => {
    setCustomOrderIds((prev) => {
      const handIds = hand.map(cardId);
      const stillHere = prev.filter((id) => handIds.includes(id));
      const newIds = handIds.filter((id) => !stillHere.includes(id));
      return [...stillHere, ...newIds];
    });
  }, [hand]);

  const cardById = new Map(hand.map((c) => [cardId(c), c]));
  const customSorted = customOrderIds.map((id) => cardById.get(id)).filter(Boolean) as Card[];

  const sorted = sortMode === "number" ? numberSorted : sortMode === "suit" ? suitSorted : customSorted;
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

  function switchSortMode(mode: SortMode) {
    if (mode === "custom" && sortMode !== "custom") {
      // 처음 "내맘대로"로 바꾸는 순간엔, 지금 보고 있던 순서를 그대로 시작점으로 삼음
      setCustomOrderIds(sorted.map(cardId));
    }
    setSortMode(mode);
  }

  const selectedCount = selectedIds.size;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* 정렬 모드 선택 */}
      <div style={{ display: "flex", gap: 6, padding: "0 12px" }}>
        <SortButton active={sortMode === "number"} onClick={() => switchSortMode("number")}>
          숫자순
        </SortButton>
        <SortButton active={sortMode === "suit"} onClick={() => switchSortMode("suit")}>
          모양순
        </SortButton>
        <SortButton active={sortMode === "custom"} onClick={() => switchSortMode("custom")}>
          내맘대로
        </SortButton>
      </div>

      {/* 모드가 바뀌어도(1줄↔2줄) 전체 높이가 똑같이 유지되도록 고정 — 그래야 아래 버튼들이 안 밀림 */}
      <div
        ref={containerRef}
        style={{
          height: 116,
          minHeight: 116,
          maxHeight: 116,
          flexShrink: 0,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          width: "100%",
        }}
      >
        {sortMode === "custom" ? (
          <CustomOrderRow
            cards={customSorted}
            orderIds={customOrderIds}
            onReorder={setCustomOrderIds}
            hidden={hidden}
            theme={theme}
            tileWidth={tileWidth}
            selectedIds={selectedIds}
            onToggle={toggle}
          />
        ) : (
          <div
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 5,
              padding: `4px ${ROW_PADDING_X}px 4px`,
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
        )}
      </div>

      <div style={{ display: "flex", gap: 8, padding: "0 56px 12px 12px" }}>
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

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 10px",
        borderRadius: 14,
        border: active ? "1px solid #e0304a" : "1px solid rgba(255,255,255,0.15)",
        background: active ? "rgba(224,48,74,0.2)" : "rgba(255,255,255,0.05)",
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        opacity: active ? 1 : 0.6,
      }}
    >
      {children}
    </button>
  );
}

/** 한 줄 — 실측으로 계산된 고정 px 폭으로 카드를 그림 (절대 넘치지 않음), 숫자순/모양순 전용 */
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
      {hidden ? (
        cards.map((card) => <CardBack key={cardId(card)} theme={theme} widthPx={tileWidth} />)
      ) : (
        <AnimatePresence mode="popLayout">
          {cards.map((card) => (
            <motion.div
              key={cardId(card)}
              layout
              initial={{ opacity: 0, y: 14, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -34, scale: 0.6 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <LexioCard
                card={card}
                theme={theme}
                widthPx={tileWidth}
                selected={selectedIds.has(cardId(card))}
                onClick={() => onToggle(card)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}

/** "내맘대로" 모드 — 드래그 중인 위치에서 "실제로 렌더링된 다른 카드들과의 거리"를 재서
 * 가장 가까운 자리로 끼워 넣는다 (좌표 계산 대신 실측 방식이라 훨씬 정확함) */
function CustomOrderRow({
  cards,
  orderIds,
  onReorder,
  hidden,
  theme,
  tileWidth,
  selectedIds,
  onToggle,
}: {
  cards: Card[];
  orderIds: string[];
  onReorder: (ids: string[]) => void;
  hidden: boolean;
  theme: CardTheme;
  tileWidth: number;
  selectedIds: Set<string>;
  onToggle: (card: Card) => void;
}) {
  const cardElsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const topCount = Math.ceil(cards.length / 2);
  const topRow = cards.slice(0, topCount);
  const bottomRow = cards.slice(topCount);

  function reorderTo(draggedId: string, point: { x: number; y: number }) {
    let nearestId: string | null = null;
    let nearestDist = Infinity;

    for (const [id, el] of Object.entries(cardElsRef.current)) {
      if (id === draggedId || !el) continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dist = Math.hypot(point.x - cx, point.y - cy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestId = id;
      }
    }
    if (!nearestId) return;

    const withoutDragged = orderIds.filter((id) => id !== draggedId);
    const nearestIndex = withoutDragged.indexOf(nearestId);
    if (nearestIndex === -1) return;

    const nearestEl = cardElsRef.current[nearestId];
    if (!nearestEl) return;
    const nearestRect = nearestEl.getBoundingClientRect();
    const insertAfter = point.x > nearestRect.left + nearestRect.width / 2;
    const insertIndex = insertAfter ? nearestIndex + 1 : nearestIndex;

    const next = [...withoutDragged.slice(0, insertIndex), draggedId, ...withoutDragged.slice(insertIndex)];
    // 순서가 실제로 바뀌었을 때만 갱신 (매 프레임 불필요한 리렌더 방지)
    if (next.join(",") !== orderIds.join(",")) onReorder(next);
  }

  function registerRef(id: string, el: HTMLDivElement | null) {
    cardElsRef.current[id] = el;
  }

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: ROW_GAP, padding: `4px ${ROW_PADDING_X}px` }}>
      <div style={{ display: "flex", gap: ROW_GAP, justifyContent: "center" }}>
        {topRow.map((card) =>
          hidden ? (
            <CardBack key={cardId(card)} theme={theme} widthPx={tileWidth} />
          ) : (
            <DraggableCard
              key={cardId(card)}
              card={card}
              theme={theme}
              tileWidth={tileWidth}
              selected={selectedIds.has(cardId(card))}
              onToggle={onToggle}
              onDrag={reorderTo}
              registerRef={registerRef}
            />
          )
        )}
      </div>
      {bottomRow.length > 0 && (
        <div style={{ display: "flex", gap: ROW_GAP, justifyContent: "center" }}>
          {bottomRow.map((card) =>
            hidden ? (
              <CardBack key={cardId(card)} theme={theme} widthPx={tileWidth} />
            ) : (
              <DraggableCard
                key={cardId(card)}
                card={card}
                theme={theme}
                tileWidth={tileWidth}
                selected={selectedIds.has(cardId(card))}
                onToggle={onToggle}
                onDrag={reorderTo}
                registerRef={registerRef}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

/** 자유롭게 드래그되다가, 손을 뗀 순간에만 딱 한 번 계산해서 그 자리로 부드럽게 스냅됨
 * (드래그 도중 계속 재계산하면 카드들이 이랬다저랬다 하며 어수선해 보여서, 놓을 때 한 번만 정리함) */
function DraggableCard({
  card,
  theme,
  tileWidth,
  selected,
  onToggle,
  onDrag,
  registerRef,
}: {
  card: Card;
  theme: CardTheme;
  tileWidth: number;
  selected: boolean;
  onToggle: (card: Card) => void;
  onDrag: (draggedId: string, point: { x: number; y: number }) => void;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
}) {
  const id = cardId(card);
  return (
    <motion.div
      ref={(el) => registerRef(id, el)}
      layout
      drag
      dragMomentum={false}
      dragElastic={0.12}
      dragSnapToOrigin
      whileDrag={{ scale: 1.15, zIndex: 20 }}
      onDragEnd={(_e, info) => onDrag(id, info.point)}
      style={{ touchAction: "none" }}
    >
      <LexioCard
        card={card}
        theme={theme}
        widthPx={tileWidth}
        selected={selected}
        onClick={() => onToggle(card)}
      />
    </motion.div>
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
