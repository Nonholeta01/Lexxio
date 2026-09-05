"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getRoomPlayers, startRoom, leaveRoom, MAX_ROOM_SEATS } from "@/lib/rooms";
import ChatPanel from "@/components/ChatPanel";
import ConfirmModal from "@/components/ConfirmModal";
import { setMatchOptions, initMatchScores } from "@/lib/matchScoring";
import { startNewRound, addBot, removePlayer } from "@/lib/gameApi";
import { updateAvatarIcon } from "@/lib/avatar";
import { useBadgeHolders } from "@/lib/badges";
import BadgeRow from "@/components/BadgeRow";
import AvatarPickerModal from "@/components/AvatarPickerModal";
import SupportCreatorButton from "@/components/SupportCreatorButton";
import RulesModal, { RulesTriggerButton } from "@/components/RulesModal";

interface SeatedPlayer {
  seat_no: number;
  player: {
    id: string;
    nickname: string;
    is_bot: boolean;
    bot_difficulty: "easy" | "medium" | null;
    avatar_icon: string;
  };
}

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params.roomId;

  const [players, setPlayers] = useState<SeatedPlayer[]>([]);
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pickingTarget, setPickingTarget] = useState(false);
  const [targetScore, setTargetScoreLocal] = useState<number | null>(null);
  const [applyTwoWeight, setApplyTwoWeightLocal] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [addingBotSeat, setAddingBotSeat] = useState<number | null>(null);
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [kickTarget, setKickTarget] = useState<SeatedPlayer | null>(null);
  const [managingBot, setManagingBot] = useState<SeatedPlayer | null>(null);
  const badgeHolders = useBadgeHolders();
  const [turnTimeLimit, setTurnTimeLimitLocal] = useState(20);

  const refresh = useCallback(async () => {
    const { data: room } = await supabase
      .from("rooms")
      .select("player_count, host_id, status")
      .eq("id", roomId)
      .single();
    if (room) {
      setPlayerCount(room.player_count);
      setHostId(room.host_id);
      if (room.status === "playing") {
        router.push(`/game/${roomId}`); // 게임 화면으로 이동 (다음 단계에서 구현)
      }
    }
    const list = await getRoomPlayers(roomId);
    setPlayers(list as any);

    // 방은 그대로인데 내가 참가자 목록에 없으면 강퇴당한 것 → 로비로 돌려보냄
    if (room) {
      const { data: userData } = await supabase.auth.getUser();
      const stillIn = (list ?? []).some((p: any) => p.player?.id === userData.user?.id);
      if (userData.user && !stillIn) {
        alert("방에서 강퇴당했어요.");
        router.push("/lobby");
      }
    }
  }, [roomId, router]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
    refresh();

    // 방/참가자/상태 변화를 실시간으로 반영
    const channel = supabase
      .channel(`room-${roomId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
        refresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        refresh
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, refresh]);

  async function handleLeave() {
    try {
      await leaveRoom(roomId);
      router.push("/lobby");
    } catch (e: any) {
      alert(e.message ?? "나가지 못했어요.");
    }
  }

  async function handleConfirmStart() {
    setConfirming(false);
    if (!targetScore) return;

    const actualCount = players.length;
    if (actualCount < 3 || actualCount > 5) {
      alert("3~5명이 모여야 시작할 수 있어요.");
      return;
    }
    const actualPlayerCount = actualCount as 3 | 4 | 5;

    try {
      await setMatchOptions(roomId, actualPlayerCount, targetScore, applyTwoWeight, turnTimeLimit);
      await initMatchScores(
        roomId,
        players.map((p) => p.player.id)
      );
      await startRoom(roomId);
      // 방장이 즉시 1라운드를 딜 — "3 구름"을 가진 사람이 자동으로 선이 되고, 첫 턴은 60초를 준다
      await startNewRound(
        roomId,
        actualPlayerCount,
        players.map((p) => ({ seat_no: p.seat_no, player_id: p.player.id })),
        0,
        1,
        60
      );
      router.push(`/game/${roomId}`);
    } catch (e: any) {
      alert(e.message ?? "게임을 시작하지 못했어요.");
    }
  }

  function handleOpenStart() {
    if (players.length < 3) {
      alert("최소 3명이 모여야 시작할 수 있어요. (지금 " + players.length + "명)");
      return;
    }
    setPickingTarget(true);
  }

  const isHost = myId && hostId && myId === hostId;

  async function handleAddBot(seatNo: number, difficulty: "easy" | "medium") {
    setAddingBotSeat(null);
    try {
      await addBot(roomId, seatNo, difficulty);
      refresh();
    } catch (e: any) {
      alert(e.message ?? "AI 추가에 실패했어요.");
    }
  }

  async function handleSelectAvatar(icon: string) {
    setPickingAvatar(false);
    try {
      await updateAvatarIcon(icon);
      refresh();
    } catch (e: any) {
      alert(e.message ?? "아이콘 변경에 실패했어요.");
    }
  }

  async function handleKickConfirmed() {
    if (!kickTarget) return;
    const targetId = kickTarget.player.id;
    setKickTarget(null);
    try {
      await removePlayer(roomId, targetId);
      refresh();
    } catch (e: any) {
      alert(e.message ?? "강퇴하지 못했어요.");
    }
  }

  async function handleBotDifficultyChange(difficulty: "easy" | "medium") {
    if (!managingBot) return;
    const { seat_no, player } = managingBot;
    setManagingBot(null);
    try {
      await removePlayer(roomId, player.id);
      await addBot(roomId, seat_no, difficulty);
      refresh();
    } catch (e: any) {
      alert(e.message ?? "AI 난이도 변경에 실패했어요.");
    }
  }

  async function handleBotRemove() {
    if (!managingBot) return;
    const targetId = managingBot.player.id;
    setManagingBot(null);
    try {
      await removePlayer(roomId, targetId);
      refresh();
    } catch (e: any) {
      alert(e.message ?? "AI 제거에 실패했어요.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ padding: "16px 16px 8px", display: "flex", justifyContent: "space-between", position: "relative" }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
          방 ({players.length}/{MAX_ROOM_SEATS})
        </h1>
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
          <RulesTriggerButton onClick={() => setRulesOpen(true)} />
        </div>
        <button
          onClick={handleLeave}
          style={{ background: "transparent", border: "none", color: "#f87171", fontSize: 13 }}
        >
          나가기
        </button>
      </div>

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />

      {/* 참가자 좌석 */}
      <div style={{ padding: "8px 16px", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {Array.from({ length: MAX_ROOM_SEATS }).map((_, seatNo) => {
          const seated = players.find((p) => p.seat_no === seatNo);
          const isEmpty = !seated;
          const isMine = seated?.player.id === myId;
          const canManage = seated && !isMine && isHost; // 방장이 남의 자리를 조작할 수 있는지
          return (
            <div
              key={seatNo}
              onClick={() => {
                if (isEmpty && isHost) setAddingBotSeat(seatNo);
                else if (isMine) setPickingAvatar(true);
                else if (canManage && seated) {
                  if (seated.player.is_bot) setManagingBot(seated);
                  else setKickTarget(seated);
                }
              }}
              style={{
                width: 72,
                padding: "10px 4px",
                borderRadius: 12,
                textAlign: "center",
                cursor: (isEmpty && isHost) || isMine || canManage ? "pointer" : "default",
                background: seated ? "rgba(224,48,74,0.15)" : "rgba(255,255,255,0.04)",
                border: seated ? "1px solid #e0304a" : "1px dashed rgba(255,255,255,0.15)",
              }}
            >
              <div style={{ fontSize: 20 }}>
                {seated ? (seated.player.is_bot ? "🤖" : seated.player.avatar_icon) : "＋"}
              </div>
              <div style={{ fontSize: 11, marginTop: 4, opacity: seated ? 1 : 0.4 }}>
                {seated ? seated.player.nickname : "빈 자리"}
                {seated?.player.id === hostId && " 👑"}
              </div>
              {seated && (badgeHolders[seated.player.id]?.length ?? 0) > 0 && (
                <div style={{ marginTop: 3 }}>
                  <BadgeRow badges={badgeHolders[seated.player.id]} size={12} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {pickingAvatar && (
        <AvatarPickerModal
          currentIcon={players.find((p) => p.player.id === myId)?.player.avatar_icon ?? "🎴"}
          onSelect={handleSelectAvatar}
          onClose={() => setPickingAvatar(false)}
        />
      )}

      {kickTarget && (
        <ConfirmModal
          message={`${kickTarget.player.nickname}님을 강퇴할까요?\n(다시 들어오는 건 자유예요)`}
          onConfirm={handleKickConfirmed}
          onCancel={() => setKickTarget(null)}
        />
      )}

      {managingBot && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
          }}
          onClick={() => setManagingBot(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "80%",
              background: "#1c1c22",
              borderRadius: 16,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <p style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px", textAlign: "center" }}>
              {managingBot.player.nickname} 관리
            </p>
            {(["easy", "medium"] as const).map((diff) => (
              <button
                key={diff}
                onClick={() => handleBotDifficultyChange(diff)}
                disabled={managingBot.player.bot_difficulty === diff}
                style={{
                  padding: "12px 0",
                  borderRadius: 10,
                  border: "none",
                  background: managingBot.player.bot_difficulty === diff ? "rgba(255,255,255,0.08)" : "#e0304a",
                  color: "#fff",
                  fontWeight: 700,
                  opacity: managingBot.player.bot_difficulty === diff ? 0.5 : 1,
                }}
              >
                🤖 {diff === "easy" ? "쉬움" : "중간"}
                {managingBot.player.bot_difficulty === diff ? " (현재)" : "으로 변경"}
              </button>
            ))}
            <button
              onClick={handleBotRemove}
              style={{
                padding: "12px 0",
                borderRadius: 10,
                border: "1px solid rgba(248,113,113,0.4)",
                background: "rgba(248,113,113,0.1)",
                color: "#f87171",
                fontWeight: 700,
              }}
            >
              제거하기
            </button>
          </div>
        </div>
      )}

      {addingBotSeat !== null && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
          }}
          onClick={() => setAddingBotSeat(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "80%",
              background: "#1c1c22",
              borderRadius: 16,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <p style={{ fontSize: 15, fontWeight: 700, margin: 0, textAlign: "center" }}>
              AI 난이도를 골라줘
            </p>
            <p style={{ fontSize: 11, opacity: 0.5, margin: 0, textAlign: "center" }}>
              AI와 함께하는 매치는 리더보드에 기록되지 않고, 중도 포기 페널티도 없어요.
            </p>
            <button
              onClick={() => handleAddBot(addingBotSeat, "easy")}
              style={{
                padding: "12px 0",
                borderRadius: 10,
                border: "none",
                background: "#e0304a",
                color: "#fff",
                fontWeight: 700,
              }}
            >
              🤖 쉬움
            </button>
            <button
              onClick={() => handleAddBot(addingBotSeat, "medium")}
              style={{
                padding: "12px 0",
                borderRadius: 10,
                border: "none",
                background: "#e0304a",
                color: "#fff",
                fontWeight: 700,
              }}
            >
              🤖 중간
            </button>
          </div>
        </div>
      )}

      {/* 방 채팅 (하단 고정 버튼들과 안 겹치게 여백 확보) */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          paddingBottom: 60,
        }}
      >
        <ChatPanel roomId={roomId} />
      </div>

      {/* 하단 중앙: 제작자 커피 사주기 (좌측 시작 버튼, 우측 소리 버튼과 안 겹치게 가운데로) */}
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 60,
          bottom: 16,
          zIndex: 30,
        }}
      >
        <SupportCreatorButton compact />
      </div>

      {/* 좌측 하단 시작 버튼 (방장 전용) */}
      {isHost && (
        <button
          onClick={handleOpenStart}
          style={{
            position: "absolute",
            left: 16,
            bottom: 16,
            padding: "12px 20px",
            borderRadius: 14,
            border: "none",
            background: "#e0304a",
            color: "#fff",
            fontWeight: 800,
            fontSize: 14,
            boxShadow: "0 6px 16px rgba(224,48,74,0.4)",
          }}
        >
          ▶ 시작
        </button>
      )}

      {pickingTarget && (
        <GameOptionsSheet
          playerCount={players.length}
          onSelect={(score, weight, turnTime) => {
            setTargetScoreLocal(score);
            setApplyTwoWeightLocal(weight);
            setTurnTimeLimitLocal(turnTime);
            setPickingTarget(false);
            setConfirming(true);
          }}
          onClose={() => setPickingTarget(false)}
        />
      )}

      {confirming && targetScore && (
        <ConfirmModal
          message={`${players.length}인용 · 목표점수 ${targetScore}점 · 턴 제한 ${turnTimeLimit}초${
            applyTwoWeight ? " · 2 가중치 적용" : ""
          }\n시작할까요?`}
          onConfirm={handleConfirmStart}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

function GameOptionsSheet({
  playerCount,
  onSelect,
  onClose,
}: {
  playerCount: number;
  onSelect: (score: number, applyTwoWeight: boolean, turnTimeLimit: number) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState("");
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [weight, setWeight] = useState(false);
  const [turnTime, setTurnTime] = useState(20);
  const scorePresets = [100, 150, 200];
  const timePresets = [15, 20, 25, 30];

  function handleConfirm() {
    const score = selectedScore ?? (custom ? Number(custom) : null);
    if (!score) return;
    onSelect(score, weight, turnTime);
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxHeight: "80%",
          overflowY: "auto",
          background: "#1c1c22",
          borderRadius: 16,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <p style={{ fontSize: 16, fontWeight: 800, margin: 0, textAlign: "center" }}>게임 설정</p>

        {/* 인원수 — 선택 아님, 지금 모여있는 실제 인원 그대로 표시만 */}
        <OptionBlock label="인원수 (현재 모인 인원 기준)">
          <div
            style={{
              padding: "10px 0",
              borderRadius: 10,
              textAlign: "center",
              background: "rgba(255,255,255,0.06)",
              fontWeight: 700,
            }}
          >
            {playerCount}인용
          </div>
        </OptionBlock>

        {/* 목표점수 */}
        <OptionBlock label="목표점수">
          <div style={{ display: "flex", gap: 8 }}>
            {scorePresets.map((p) => (
              <PickButton key={p} active={selectedScore === p} onClick={() => { setSelectedScore(p); setCustom(""); }}>
                {p}점
              </PickButton>
            ))}
          </div>
          <input
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value.replace(/[^0-9]/g, ""));
              setSelectedScore(null);
            }}
            placeholder="직접 입력"
            style={{ ...inputStyle, marginTop: 8 }}
          />
        </OptionBlock>

        {/* 턴 제한시간 */}
        <OptionBlock label="턴 제한시간 (초과 시 자동 패스)">
          <div style={{ display: "flex", gap: 8 }}>
            {timePresets.map((t) => (
              <PickButton key={t} active={turnTime === t} onClick={() => setTurnTime(t)}>
                {t}초
              </PickButton>
            ))}
          </div>
        </OptionBlock>

        {/* 2 가중치 */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.04)",
            fontSize: 13,
          }}
        >
          <span>
            2 가중치 적용
            <br />
            <span style={{ fontSize: 11, opacity: 0.5 }}>2를 들고 지면 점수 2배씩 손해</span>
          </span>
          <input
            type="checkbox"
            checked={weight}
            onChange={(e) => setWeight(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
        </label>

        <button
          onClick={handleConfirm}
          disabled={!selectedScore && !custom}
          style={{
            padding: "13px 0",
            borderRadius: 12,
            border: "none",
            background: "#e0304a",
            color: "#fff",
            fontWeight: 800,
            fontSize: 15,
            opacity: !selectedScore && !custom ? 0.4 : 1,
          }}
        >
          다음
        </button>
      </div>
    </div>
  );
}

function OptionBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 12, opacity: 0.6 }}>{label}</span>
      {children}
    </div>
  );
}

function PickButton({
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
        flex: 1,
        padding: "10px 0",
        borderRadius: 10,
        border: active ? "1px solid #e0304a" : "1px solid rgba(255,255,255,0.15)",
        background: active ? "rgba(224,48,74,0.25)" : "rgba(255,255,255,0.05)",
        color: "#fff",
        fontWeight: 700,
        fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.05)",
  color: "#fff",
  fontSize: 14,
  boxSizing: "border-box",
};
