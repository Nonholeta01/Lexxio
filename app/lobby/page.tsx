"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { listWaitingRooms, createRoom, joinRoom, type RoomListItem } from "@/lib/rooms";
import { useOnlineUsers } from "@/lib/presence";
import { signOut } from "@/lib/auth";
import RulesModal, { RulesTriggerButton } from "@/components/RulesModal";
import ChatPanel from "@/components/ChatPanel";

export default function LobbyPage() {
  const router = useRouter();
  const onlineUsers = useOnlineUsers();
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);

  const refresh = useCallback(async () => {
    setRooms(await listWaitingRooms());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 4000); // 간단한 폴링 (소규모 인원이라 이 정도로 충분)
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleCreate() {
    try {
      const roomId = await createRoom();
      router.push(`/room/${roomId}`);
    } catch (e: any) {
      alert(e.message ?? "방 생성에 실패했어요.");
    }
  }

  async function handleJoin(roomId: string) {
    try {
      await joinRoom(roomId);
      router.push(`/room/${roomId}`);
    } catch (e: any) {
      alert(e.message ?? "입장에 실패했어요.");
    }
  }

  async function handleLogout() {
    await signOut();
    router.push("/auth");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* 헤더 */}
      <div
        style={{
          position: "relative",
          padding: "16px 16px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>로비</h1>
          <RulesTriggerButton onClick={() => setRulesOpen(true)} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleLogout}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "transparent",
              color: "#f87171",
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            로그아웃
          </button>
          <button
            onClick={() => router.push("/leaderboard")}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "transparent",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            🏆 랭킹
          </button>
          <button
            onClick={handleCreate}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "none",
              background: "#e0304a",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            + 방 만들기
          </button>
        </div>
      </div>

      {/* 중앙 방목록 + 우측 접속자 */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* 중앙: 방 목록 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 12px" }}>
          {rooms.length === 0 && (
            <p style={{ opacity: 0.4, fontSize: 13, textAlign: "center", marginTop: 40 }}>
              대기 중인 방이 없어요. 방을 만들어봐!
            </p>
          )}
          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => handleJoin(room.id)}
              style={{
                width: "100%",
                textAlign: "left",
                marginBottom: 8,
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)",
                color: "#fff",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700 }}>{room.host_nickname}의 방</div>
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                {room.joined_count} / {room.max_seats}명 · 코드 {room.invite_code}
              </div>
            </button>
          ))}
        </div>

        {/* 우측: 접속자 목록 */}
        <div
          style={{
            width: 92,
            borderLeft: "1px solid rgba(255,255,255,0.08)",
            padding: "8px 6px",
            overflowY: "auto",
          }}
        >
          <p style={{ fontSize: 11, opacity: 0.5, textAlign: "center", marginBottom: 6 }}>
            접속자 {onlineUsers.length}
          </p>
          {onlineUsers.map((u) => (
            <div
              key={u.id}
              style={{
                fontSize: 11,
                textAlign: "center",
                padding: "4px 2px",
                marginBottom: 4,
                borderRadius: 8,
                background: "rgba(255,255,255,0.05)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              🟢 {u.nickname}
            </div>
          ))}
        </div>
      </div>

      {/* 하단: 로비 전체 채팅 (소리 버튼과 안 겹치게 아래쪽 여백 확보) */}
      <div
        style={{
          height: 220,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          paddingBottom: 44,
          boxSizing: "border-box",
        }}
      >
        <ChatPanel roomId={null} />
      </div>

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
