import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import type { BadgeType } from "@/components/Badge";

export const MIN_GAMES_FOR_BADGES = 20;

/** playerId → 그 사람이 가진 배지 목록 (배지 없으면 키 자체가 없음) */
export function useBadgeHolders(): Record<string, BadgeType[]> {
  const [holders, setHolders] = useState<Record<string, BadgeType[]>>({});

  useEffect(() => {
    let active = true;

    async function load() {
      const [{ data: leaderboardData }, { data: bestData }] = await Promise.all([
        supabase.from("leaderboard").select("*"),
        supabase.from("player_best_round_scores").select("player_id, best_single_round_score"),
      ]);
      if (!active) return;

      const rows = (leaderboardData ?? []) as any[];
      const eligible = rows.filter((r) => r.total_games >= MIN_GAMES_FOR_BADGES);
      const bestMap: Record<string, number> = {};
      (bestData ?? []).forEach((b: any) => {
        bestMap[b.player_id] = b.best_single_round_score;
      });

      const map: Record<string, BadgeType[]> = {};
      function add(id: string, badge: BadgeType) {
        map[id] = [...(map[id] ?? []), badge];
      }

      if (eligible.length > 0) {
        const totalScoreKing = eligible.reduce((a, b) => (b.total_score > a.total_score ? b : a)).player_id;
        const avgScoreKing = eligible.reduce((a, b) =>
          b.avg_score_per_game > a.avg_score_per_game ? b : a
        ).player_id;
        const bestSingle = eligible.reduce((a, b) =>
          (bestMap[b.player_id] ?? -Infinity) > (bestMap[a.player_id] ?? -Infinity) ? b : a
        ).player_id;

        add(totalScoreKing, "totalScoreKing");
        add(avgScoreKing, "avgScoreKing");
        add(bestSingle, "bestSingleMatch");
      }

      setHolders(map);
    }
    load();

    return () => {
      active = false;
    };
  }, []);

  return holders;
}
