"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  startNewRound,
  fetchMyHand,
  fetchTableState,
  playCards,
  passTurn,
  revealRoundHands,
  pauseGame,
  unpauseGame,
  quitMatchWithPenalty,
  requestAdvance,
  getBotHand,
  botPlayCards,
  botPassTurn,
  getHandCounts,
  type TableState,
} from "@/lib/gameApi";
import { evaluateCombo, canBeat, type Card, type PlayerCount, type HandEval } from "@/lib/lexioEngine";
import { computeRoundScores, type RoundHandResult } from "@/lib/roundScoring";
import { applyRoundScores, useMatchScores, findMatchWinner } from "@/lib/matchScoring";
import { finalizeMatch } from "@/lib/matchScoring";
import { chooseBotMove, type BotDifficulty } from "@/lib/botAI";
import { playShuffleSound, playTileClack, playFanfare } from "@/lib/sounds";
import HandTray from "@/components/HandTray";
import CurrentComboBanner from "@/components/CurrentComboBanner";
import PlayerScoreBoard from "@/components/PlayerScoreBoard";
import CardThemeToggleButton from "@/components/CardThemeToggleButton";
import ChatPanel from "@/components/ChatPanel";
import ConfirmModal from "@/components/ConfirmModal";
import { useCardTheme } from "@/lib/cardTheme";
import { useChat } from "@/lib/chat";
import { usePlayLog } from "@/lib/playLog";
import PlayHistoryStrip from "@/components/PlayHistoryStrip";

interface SeatedPlayer {
  seat_no: number;
  player_id: string;
  nickname: string;
  isBot: boolean;
  botDifficulty: BotDifficulty | null;
}

export default function GamePage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params.roomId;

  const [myId, setMyId] = useState<string | null>(null);
  const [playerCount, setPlayerCount] = useState<PlayerCount | null>(null);
  const [targetScore, setTargetScore] = useState<number>(150);
  const [applyTwoWeight, setApplyTwoWeight] = useState(false);
  const [turnTimeLimit, setTurnTimeLimit] = useState(20);
  const [hostId, setHostId] = useState<string | null>(null);
  const [seated, setSeated] = useState<SeatedPlayer[]>([]);

  const [tableState, setTableStateLocal] = useState<TableState | null>(null);
  const [myHand, setMyHand] = useState<Card[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [handCounts, setHandCounts] = useState<Record<string, number>>({});
  const [roundResult, setRoundResult] = useState<
    { nickname: string; remaining: number; delta: number }[] | null
  >(null);
  const [armedCards, setArmedCards] = useState<Card[] | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [quitting, setQuitting] = useState(false);
  const [chatToast, setChatToast] = useState<{ playerId: string; content: string } | null>(null);

  const chatInitializedRef = useRef(false);
  const lastChatMessageIdRef = useRef<string | null>(null);
  const { messages: chatMessages } = useChat(roomId);
  const playLog = usePlayLog(roomId, tableState?.round_number ?? 1);

  const lastComboPlayerRef = useRef<string | null>(null);
  const lastRoundWinnerRef = useRef<string | null>(null);
  const finalizingRef = useRef(false);
  const pendingAdvanceRef = useRef<{ proceed: () => void } | null>(null);
  const [advanceRequestedByMe, setAdvanceRequestedByMe] = useState(false);

  const matchScores = useMatchScores(roomId);
  const [cardTheme] = useCardTheme();

  // ---------- 초기 로드 ----------
  const loadRoomInfo = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    setMyId(userData.user?.id ?? null);

    const { data: room } = await supabase
      .from("rooms")
      .select("player_count, target_score, apply_two_weight, turn_time_limit, host_id, status")
      .eq("id", roomId)
      .single();

    if (room) {
      setPlayerCount(room.player_count);
      setTargetScore(room.target_score ?? 150);
      setApplyTwoWeight(room.apply_two_weight);
      setTurnTimeLimit(room.turn_time_limit ?? 20);
      setHostId(room.host_id);
      if (room.status === "waiting") {
        router.push(`/room/${roomId}`); // 매치가 이미 끝나서 대기 상태로 돌아간 경우
      }
    }

    const { data: players } = await supabase
      .from("room_players")
      .select("seat_no, player_id, player:profiles(nickname, is_bot, bot_difficulty)")
      .eq("room_id", roomId)
      .order("seat_no");

    setSeated(
      (players ?? []).map((p: any) => ({
        seat_no: p.seat_no,
        player_id: p.player_id,
        nickname: p.player?.nickname ?? "익명",
        isBot: p.player?.is_bot ?? false,
        botDifficulty: p.player?.bot_difficulty ?? null,
      }))
    );
  }, [roomId, router]);

  useEffect(() => {
    loadRoomInfo();
  }, [loadRoomInfo]);

  // ---------- 테이블 상태 실시간 구독 ----------
  useEffect(() => {
    fetchTableState(roomId).then(setTableStateLocal);

    const channel = supabase
      .channel(`game-table-${roomId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_table_state", filter: `room_id=eq.${roomId}` },
        (payload) => setTableStateLocal(payload.new as TableState)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // ---------- 내 손패 갱신 (라운드 번호가 바뀌면 = 새로 딜됨) ----------
  useEffect(() => {
    if (!tableState) return;
    fetchMyHand(roomId).then(setMyHand);
  }, [roomId, tableState?.round_number]);

  // ---------- 채팅 새 메시지 → 5초간 말풍선 토스트로 보여줌 (콘솔 안 열어도 보이게) ----------
  useEffect(() => {
    if (chatMessages.length === 0) return;
    const last = chatMessages[chatMessages.length - 1];
    if (!chatInitializedRef.current) {
      // 최초 히스토리 로딩 시점엔 과거 메시지가 토스트로 뜨지 않게 스킵
      chatInitializedRef.current = true;
      lastChatMessageIdRef.current = last.id;
      return;
    }
    if (last.id !== lastChatMessageIdRef.current) {
      lastChatMessageIdRef.current = last.id;
      setChatToast({ playerId: last.sender_id, content: last.content });
    }
  }, [chatMessages]);

  useEffect(() => {
    if (!chatToast) return;
    const timer = setTimeout(() => setChatToast(null), 5000);
    return () => clearTimeout(timer);
  }, [chatToast]);

  // ---------- 남은 패 개수 갱신 (카드를 낼 때마다 바뀌므로 그때그때 다시 조회) ----------
  useEffect(() => {
    if (!tableState) return;
    getHandCounts(roomId)
      .then(setHandCounts)
      .catch((e) => console.error("잔여 패 개수 조회 실패:", e));
  }, [roomId, tableState?.round_number, tableState?.current_combo_player_id, tableState?.current_turn_seat]);

  // ---------- 사운드: 새 라운드 딜(촤라락) ----------
  useEffect(() => {
    playShuffleSound();
  }, [tableState?.round_number]);

  useEffect(() => {
    if (!tableState) return;
    if (
      tableState.current_combo_player_id &&
      tableState.current_combo_player_id !== lastComboPlayerRef.current
    ) {
      playTileClack();
    }
    lastComboPlayerRef.current = tableState.current_combo_player_id;
  }, [tableState?.current_combo_player_id]);

  // ---------- 라운드 종료 감지 → 점수 계산 (팡파레 + 결과 패널, 최종 반영은 방장만) ----------
  useEffect(() => {
    if (!tableState || !playerCount) return;
    if (tableState.round_winner_id && tableState.round_winner_id !== lastRoundWinnerRef.current) {
      lastRoundWinnerRef.current = tableState.round_winner_id;
      playFanfare();
      handleRoundEnd();
    }
    if (!tableState.round_winner_id) {
      lastRoundWinnerRef.current = null;
      setRoundResult(null);
      setAdvanceRequestedByMe(false);
    }
  }, [tableState?.round_winner_id]);

  // ---------- 승자가 "다음으로"를 누르면(advance_requested) 방장은 대기시간을 건너뛰고 바로 진행 ----------
  useEffect(() => {
    if (tableState?.advance_requested && myId === hostId && pendingAdvanceRef.current) {
      pendingAdvanceRef.current.proceed();
    }
  }, [tableState?.advance_requested, myId, hostId]);

  async function handleRoundEnd() {
    if (!playerCount) return;
    const revealed = await revealRoundHands(roomId);
    const handResults: RoundHandResult[] = revealed.map((r) => ({
      playerId: r.player_id,
      remainingCards: r.cards,
    }));
    const deltas = computeRoundScores(handResults, applyTwoWeight);

    setRoundResult(
      deltas.map((d) => {
        const nickname = seated.find((s) => s.player_id === d.playerId)?.nickname ?? "?";
        const remaining = handResults.find((h) => h.playerId === d.playerId)?.remainingCards.length ?? 0;
        return { nickname, remaining, delta: d.delta };
      })
    );

    // 점수 반영 + 다음 진행은 방장 클라이언트만 수행 (중복 반영 방지)
    if (myId && myId === hostId && !finalizingRef.current) {
      finalizingRef.current = true;
      await applyRoundScores(
        roomId,
        deltas.map((d) => ({ playerId: d.playerId, delta: d.delta }))
      );

      // 최신 누적 점수를 다시 조회해서 목표 도달 여부 확인
      const { data: freshScores } = await supabase
        .from("match_scores")
        .select("player_id, score, player:profiles(nickname)")
        .eq("room_id", roomId);

      const scoreRows = (freshScores ?? []).map((s: any) => ({
        player_id: s.player_id,
        nickname: s.player?.nickname ?? "익명",
        score: s.score,
      }));

      const winner = findMatchWinner(scoreRows, targetScore);

      let proceeded = false;
      async function proceed() {
        if (proceeded) return;
        proceeded = true;
        if (winner) {
          await finalizeMatch(roomId, playerCount!, scoreRows);
          // rooms.status 가 waiting 으로 바뀌는 걸 실시간으로 감지해서 방 화면으로 돌아감
        } else {
          const winnerSeat = seated.find((s) => s.player_id === tableState!.round_winner_id)?.seat_no ?? 0;
          await startNewRound(
            roomId,
            playerCount!,
            seated.map((s) => ({ seat_no: s.seat_no, player_id: s.player_id })),
            winnerSeat,
            (tableState?.round_number ?? 1) + 1,
            turnTimeLimit
          );
        }
        finalizingRef.current = false;
        pendingAdvanceRef.current = null;
      }

      // 자동으로 넘어가지 않음 — 이긴 사람이 "▶ 다음으로"를 눌러야만 다음 라운드/매치종료로 진행
      pendingAdvanceRef.current = { proceed };
    }
  }

  // ---------- rooms.status 실시간 구독 → 매치 끝나면 방 화면으로 ----------
  useEffect(() => {
    const channel = supabase
      .channel(`room-status-${roomId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          if ((payload.new as any).status === "waiting") {
            router.push(`/room/${roomId}`);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, router]);

  // ---------- 턴 타이머 (초과 시: 확정 대기 중이던 패가 있으면 그걸 제출, 없으면 자동 패스) ----------
  useEffect(() => {
    if (!tableState?.turn_deadline || tableState.paused_by) {
      setSecondsLeft(null);
      return;
    }
    const deadline = new Date(tableState.turn_deadline).getTime();

    const tick = () => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0 && myId === currentTurnPlayerId() && !tableState.round_winner_id) {
        if (armedCards && armedCards.length > 0) {
          handlePlay(armedCards);
          setArmedCards(null);
        } else {
          passTurn(roomId).catch(() => {});
        }
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [tableState?.turn_deadline, tableState?.current_turn_seat, tableState?.paused_by, armedCards]);

  // ---------- 봇 턴 자동 실행 (방장 브라우저가 대신 둠) ----------
  const botActingRef = useRef(false);
  useEffect(() => {
    if (!tableState || !playerCount) return;
    if (tableState.paused_by || tableState.round_winner_id) return;
    if (myId !== hostId) return;
    if (botActingRef.current) return;

    const turnPlayerId = seated.find((s) => s.seat_no === tableState.current_turn_seat)?.player_id;
    const botSeat = seated.find((s) => s.player_id === turnPlayerId && s.isBot);
    if (!botSeat) return;

    botActingRef.current = true;
    const delay = 900 + Math.random() * 700; // 사람처럼 살짝 뜸들이기
    const timer = setTimeout(async () => {
      try {
        const hand = await getBotHand(roomId, botSeat.player_id);
        const currentEval = tableState.current_combo ? evaluateCombo(tableState.current_combo, playerCount) : null;
        const move = chooseBotMove(hand, playerCount, currentEval, botSeat.botDifficulty ?? "easy");
        if (move) {
          await botPlayCards(roomId, botSeat.player_id, move);
        } else {
          await botPassTurn(roomId, botSeat.player_id);
        }
      } catch (e) {
        console.error("봇 턴 실행 실패:", e);
      } finally {
        botActingRef.current = false;
      }
    }, delay);

    return () => {
      clearTimeout(timer);
      botActingRef.current = false;
    };
  }, [tableState?.current_turn_seat, tableState?.paused_by, tableState?.round_winner_id, myId, hostId, seated, playerCount, roomId]);

  function currentTurnPlayerId(): string | null {
    if (!tableState) return null;
    return seated.find((s) => s.seat_no === tableState.current_turn_seat)?.player_id ?? null;
  }

  const isMyTurn = tableState && myId === currentTurnPlayerId() && !tableState.round_winner_id;

  async function handlePlay(selected: Card[]) {
    if (!playerCount) return;
    const evalResult = evaluateCombo(selected, playerCount);
    if (!evalResult) {
      alert("유효하지 않은 조합이에요.");
      return;
    }
    if (tableState?.current_combo) {
      const currentEval = evaluateCombo(tableState.current_combo, playerCount)!;
      if (!canBeat(evalResult, currentEval)) {
        alert("이전에 나온 패보다 강해야 해요 (같은 장수).");
        return;
      }
    }
    try {
      await playCards(roomId, selected);
      setMyHand((prev) => prev.filter((c) => !selected.some((s) => s.number === c.number && s.suit === c.suit)));
    } catch (e: any) {
      alert(e.message ?? "낼 수 없어요.");
    }
  }

  async function handlePass() {
    try {
      await passTurn(roomId);
    } catch (e: any) {
      alert(e.message ?? "지금은 패스할 수 없어요.");
    }
  }

  async function handlePauseToggle() {
    if (tableState?.paused_by) {
      if (tableState.paused_by !== myId) return; // 건 사람만 재개 가능 (버튼 자체도 숨겨지지만 방어적으로 체크)
      try {
        await unpauseGame(roomId, turnTimeLimit);
      } catch (e: any) {
        alert(e.message ?? "재개하지 못했어요.");
      }
    } else {
      try {
        await pauseGame(roomId);
      } catch (e: any) {
        alert(e.message ?? "일시정지하지 못했어요.");
      }
    }
  }

  async function handleRequestAdvance() {
    setAdvanceRequestedByMe(true);
    try {
      await requestAdvance(roomId);
    } catch (e: any) {
      setAdvanceRequestedByMe(false);
      alert(e.message ?? "다음으로 넘기지 못했어요.");
    }
  }

  async function handleQuitConfirmed() {
    setQuitting(false);
    try {
      await quitMatchWithPenalty(roomId, -50);
      // rooms.status 가 waiting 으로 바뀌는 걸 실시간 구독이 감지해서 방 화면으로 돌려보냄
    } catch (e: any) {
      alert(e.message ?? "나가지 못했어요.");
    }
  }

  const currentComboEval: HandEval | null =
    tableState?.current_combo && playerCount ? evaluateCombo(tableState.current_combo, playerCount) : null;
  const currentComboPlayerNickname = seated.find(
    (s) => s.player_id === tableState?.current_combo_player_id
  )?.nickname;

  const isPaused = !!tableState?.paused_by;
  const pausedByNickname = seated.find((s) => s.player_id === tableState?.paused_by)?.nickname;
  const canIResume = isPaused && tableState?.paused_by === myId;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ padding: "14px 16px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>
          {playerCount}인용 · 라운드 {tableState?.round_number ?? 1}
        </h1>
        {secondsLeft !== null && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: secondsLeft <= 5 ? "#f87171" : "#fff",
            }}
          >
            ⏱ {secondsLeft}s
          </span>
        )}
      </div>

      {/* 아이콘 바: 나가기 / 일시정지 / 채팅 / 패 스킨 */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "0 16px 6px", gap: 6 }}>
        <button
          onClick={() => setQuitting(true)}
          style={{
            padding: "6px 10px",
            borderRadius: 20,
            border: "1px solid rgba(248,113,113,0.4)",
            background: "rgba(248,113,113,0.1)",
            color: "#f87171",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          나가기
        </button>
        <div style={{ display: "flex", gap: 6 }}>
          <IconButton onClick={handlePauseToggle} active={isPaused} label={isPaused ? "재개" : "일시정지"}>
            {isPaused ? "▶" : "⏸"}
          </IconButton>
          <IconButton onClick={() => setChatOpen((v) => !v)} active={chatOpen} label="채팅">
            💬
          </IconButton>
          <a
            href="https://buymeacoffee.com/holicssong"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "6px 10px",
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            ☕
          </a>
          <CardThemeToggleButton />
        </div>
      </div>

      <PlayerScoreBoard
        roomId={roomId}
        targetScore={targetScore}
        activePlayerId={currentTurnPlayerId()}
        toast={chatToast}
        handCounts={handCounts}
      />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          overflowY: "auto",
        }}
      >
        {!isPaused && playerCount && (
          <PlayHistoryStrip entries={playLog} playerCount={playerCount} theme={cardTheme} />
        )}
        <CurrentComboBanner
          theme={cardTheme}
          hidden={isPaused}
          lastPlay={
            currentComboEval && currentComboPlayerNickname
              ? { nickname: currentComboPlayerNickname, hand: currentComboEval }
              : null
          }
        />
        {!isMyTurn && !roundResult && !isPaused && (
          <p style={{ textAlign: "center", fontSize: 13, opacity: 0.5 }}>
            {currentTurnPlayerId()
              ? `${seated.find((s) => s.player_id === currentTurnPlayerId())?.nickname}님의 차례...`
              : ""}
          </p>
        )}
      </div>

      <HandTray
        hand={myHand}
        theme={cardTheme}
        disabled={!isMyTurn || isPaused}
        hidden={isPaused}
        onPlay={handlePlay}
        onPass={handlePass}
        onArmedChange={setArmedCards}
        secondsLeft={secondsLeft}
      />

      {/* 일시정지 팝업 — 전원에게 보이고, 건 사람에게만 재개 버튼 */}
      {isPaused && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 70,
          }}
        >
          <div style={{ width: "78%", background: "#1c1c22", borderRadius: 16, padding: 24, textAlign: "center" }}>
            <p style={{ fontSize: 28, margin: "0 0 12px" }}>⏸</p>
            <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
              {pausedByNickname ?? "누군가"}님이 일시정지를 눌렀어요
            </p>
            <p style={{ fontSize: 12, opacity: 0.5, margin: "8px 0 20px" }}>
              {canIResume ? "재개 버튼을 눌러 계속할 수 있어요." : "건 사람만 재개할 수 있어요."}
            </p>
            {canIResume && (
              <button
                onClick={handlePauseToggle}
                style={{
                  width: "100%",
                  padding: "12px 0",
                  borderRadius: 12,
                  border: "none",
                  background: "#e0304a",
                  color: "#fff",
                  fontWeight: 800,
                }}
              >
                ▶ 재개하기
              </button>
            )}
          </div>
        </div>
      )}

      {/* 게임 중 채팅 (토글) */}
      {chatOpen && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "55%",
            background: "#111114",
            borderTop: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "16px 16px 0 0",
            zIndex: 65,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px" }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>채팅</span>
            <button
              onClick={() => setChatOpen(false)}
              style={{ background: "transparent", border: "none", color: "#fff", opacity: 0.6, fontSize: 14 }}
            >
              ✕
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ChatPanel roomId={roomId} />
          </div>
        </div>
      )}

      {quitting && (
        <ConfirmModal
          message={
            seated.some((s) => s.isBot)
              ? "AI와 함께하는 매치는 나가도 페널티가 없어요.\n정말 나갈까요?"
              : "중간에 게임을 중단할 경우 페널티로 -50점을 받은 채 게임이 종료됩니다.\n정말 나갈까요?"
          }
          onConfirm={handleQuitConfirmed}
          onCancel={() => setQuitting(false)}
        />
      )}

      {roundResult && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
          }}
        >
          <div style={{ width: "82%", background: "#1c1c22", borderRadius: 16, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>라운드 결과</p>
              <button
                onClick={() => setChatOpen((v) => !v)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  fontSize: 13,
                }}
              >
                💬
              </button>
            </div>
            {roundResult.map((r) => (
              <div
                key={r.nickname}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  fontSize: 14,
                }}
              >
                <span>
                  {r.nickname} <span style={{ opacity: 0.5, fontSize: 12 }}>(잔패 {r.remaining}장)</span>
                </span>
                <span style={{ fontWeight: 800, color: r.delta >= 0 ? "#4ade80" : "#f87171" }}>
                  {r.delta >= 0 ? "+" : ""}
                  {r.delta}
                </span>
              </div>
            ))}

            {myId === hostId && (
              <button
                onClick={handleRequestAdvance}
                disabled={advanceRequestedByMe}
                style={{
                  width: "100%",
                  marginTop: 16,
                  padding: "12px 0",
                  borderRadius: 12,
                  border: "none",
                  background: "#e0304a",
                  color: "#fff",
                  fontWeight: 800,
                  opacity: advanceRequestedByMe ? 0.5 : 1,
                }}
              >
                {advanceRequestedByMe ? "곧 다음으로 넘어가요..." : "▶ 다음으로"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IconButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        padding: "6px 10px",
        borderRadius: 20,
        border: active ? "1px solid #e0304a" : "1px solid rgba(255,255,255,0.15)",
        background: active ? "rgba(224,48,74,0.25)" : "rgba(255,255,255,0.06)",
        color: "#fff",
        fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}
