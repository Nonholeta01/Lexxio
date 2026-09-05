"use client";

import { useMatchScores } from "@/lib/matchScoring";
import { useBadgeHolders } from "@/lib/badges";
import BadgeRow from "./BadgeRow";

/**
 * 게임 화면 상단에 각 플레이어 이름 + 현재 누적점수를 보여준다.
 * match_scores 테이블을 실시간 구독하므로, 라운드가 끝나 점수가 반영되는 즉시 갱신됨.
 */
export default function PlayerScoreBoard({
  roomId,
  targetScore,
  activePlayerId,
  toast,
  handCounts,
}: {
  roomId: string;
  targetScore: number;
  activePlayerId?: string | null;
  /** 이 사람 이름표 바로 아래에 겹쳐서(레이아웃 안 밀리게) 말풍선을 띄움 */
  toast?: { playerId: string; content: string } | null;
  /** playerId → 남은 패 개수 (전략적으로 꼭 필요한 정보라 항상 보여줌) */
  handCounts?: Record<string, number>;
}) {
  const scores = useMatchScores(roomId);
  const badgeHolders = useBadgeHolders();
  const sorted = [...scores].sort((a, b) => b.score - a.score);

  return (
    <div style={{ display: "flex", gap: 6, padding: "10px 12px 4px", flexWrap: "nowrap" }}>
      {sorted.map((s) => (
        <div
          key={s.player_id}
          style={{
            position: "relative",
            flex: "1 1 0",
            minWidth: 0,
            padding: "6px 8px",
            borderRadius: 10,
            background:
              s.player_id === activePlayerId ? "rgba(224,48,74,0.25)" : "rgba(255,255,255,0.05)",
            border:
              s.player_id === activePlayerId
                ? "1px solid #e0304a"
                : "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.nickname}
            {(badgeHolders[s.player_id]?.length ?? 0) > 0 && (
              <span style={{ marginLeft: 4 }}>
                <BadgeRow badges={badgeHolders[s.player_id]} size={11} />
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#e0304a" }}>
            {s.score} <span style={{ opacity: 0.4, fontSize: 10 }}>/ {targetScore}</span>
          </div>
          {handCounts && handCounts[s.player_id] !== undefined && (
            <div style={{ fontSize: 10, opacity: 0.55, marginTop: 1 }}>🀄 {handCounts[s.player_id]}장</div>
          )}

          {toast && toast.playerId === s.player_id && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: 6,
                maxWidth: 160,
                padding: "6px 10px",
                borderRadius: "4px 12px 12px 12px",
                background: "rgba(30,30,34,0.97)",
                border: "1px solid rgba(255,255,255,0.12)",
                fontSize: 12,
                color: "#fff",
                wordBreak: "break-word",
                zIndex: 45,
                boxShadow: "0 4px 10px rgba(0,0,0,0.4)",
              }}
            >
              {toast.content}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
