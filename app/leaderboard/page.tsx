"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useBadgeHolders, MIN_GAMES_FOR_BADGES } from "@/lib/badges";
import BadgeRow from "@/components/BadgeRow";
import SupportCreatorButton from "@/components/SupportCreatorButton";

interface LeaderboardRow {
  player_id: string;
  nickname: string;
  total_games: number;
  total_score: number;
  avg_score_per_game: number;
  total_wins: number;
}

type SortKey = "total_score" | "avg_score_per_game";

export default function LeaderboardPage() {
  const router = useRouter();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const badgeHolders = useBadgeHolders();
  const [sortKey, setSortKey] = useState<SortKey>("total_score");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("leaderboard").select("*");
      setRows((data as LeaderboardRow[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const sorted = [...rows].filter((r) => r.total_games > 0).sort((a, b) => b[sortKey] - a[sortKey]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ padding: "16px 16px 8px" }}>
        <button
          onClick={() => router.push("/lobby")}
          style={{
            background: "transparent",
            border: "none",
            color: "#fff",
            opacity: 0.7,
            fontSize: 13,
            fontWeight: 700,
            padding: 0,
            marginBottom: 10,
          }}
        >
          ← 로비로
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>리더보드</h1>
        <p style={{ fontSize: 11, opacity: 0.45, margin: "4px 0 0" }}>
          {MIN_GAMES_FOR_BADGES}판 이상 플레이해야 칭호 랭킹에 들어가요
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, padding: "0 16px 12px" }}>
        <TabButton active={sortKey === "total_score"} onClick={() => setSortKey("total_score")}>
          누적점수
        </TabButton>
        <TabButton active={sortKey === "avg_score_per_game"} onClick={() => setSortKey("avg_score_per_game")}>
          게임당 평균
        </TabButton>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>
        {loading && <p style={{ opacity: 0.4, fontSize: 13, textAlign: "center" }}>불러오는 중...</p>}
        {!loading && sorted.length === 0 && (
          <p style={{ opacity: 0.4, fontSize: 13, textAlign: "center", marginTop: 40 }}>
            아직 끝난 매치가 없어요.
          </p>
        )}
        {sorted.map((row, idx) => (
          <div
            key={row.player_id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 4px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span
              style={{
                width: 24,
                textAlign: "center",
                fontWeight: 800,
                color: idx < 3 ? "#e0304a" : "#fff",
                opacity: idx < 3 ? 1 : 0.5,
                fontSize: 14,
              }}
            >
              {idx + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{row.nickname}</span>
                <BadgeRow badges={badgeHolders[row.player_id] ?? []} />
              </div>
              <div style={{ fontSize: 11, opacity: 0.5 }}>
                {row.total_games}게임 · {row.total_wins}승
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#e0304a" }}>
                {sortKey === "total_score" ? row.total_score : row.avg_score_per_game}
              </div>
              <div style={{ fontSize: 10, opacity: 0.4 }}>
                {sortKey === "total_score" ? "누적점수" : "평균/게임"}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ margin: "0 60px 12px 16px" }}>
        <SupportCreatorButton compact />
      </div>
    </div>
  );
}

function TabButton({
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
        border: "none",
        background: active ? "#fff" : "rgba(255,255,255,0.08)",
        color: active ? "#111" : "#fff",
        fontWeight: 700,
        fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}

