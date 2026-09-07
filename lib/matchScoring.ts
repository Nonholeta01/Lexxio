import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export interface MatchScoreRow {
  player_id: string;
  nickname: string;
  score: number;
}

/** 방의 실제 게임 인원 + 목표점수 + 턴 제한시간 + "2 가중치 적용" 옵션 설정 (시작 시 방장이 확정) */
export async function setMatchOptions(
  roomId: string,
  actualPlayerCount: 3 | 4 | 5,
  targetScore: number,
  applyTwoWeight: boolean,
  turnTimeLimit: number
): Promise<void> {
  const { error } = await supabase
    .from("rooms")
    .update({
      player_count: actualPlayerCount,
      target_score: targetScore,
      apply_two_weight: applyTwoWeight,
      turn_time_limit: turnTimeLimit,
    })
    .eq("id", roomId);
  if (error) throw error;
}

/** 매치 시작 시 참가자 전원의 점수를 0으로 초기화 (RLS 우회를 위해 RPC로만 기록) */
export async function initMatchScores(roomId: string, playerIds: string[]): Promise<void> {
  const { error } = await supabase.rpc("init_match_scores", {
    p_room_id: roomId,
    p_player_ids: playerIds,
  });
  if (error) throw error;
}

/**
 * 한 라운드가 끝났을 때의 점수 반영을 서버(finalize_round RPC)에게 맡긴다.
 * 클라이언트는 델타를 계산해서 넘기지 않는다 — player_hands에 실제로 남은 패를
 * 서버가 직접 읽어서 계산하므로, RPC를 직접 호출해도 원하는 점수를 넣을 수 없다.
 * 반환값은 서버가 실제로 반영한 델타이며, 화면 표시에도 이 값을 그대로 쓴다.
 */
export async function finalizeRoundScores(
  roomId: string
): Promise<{ playerId: string; delta: number }[]> {
  const { data, error } = await supabase.rpc("finalize_round", { p_room_id: roomId });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ playerId: row.player_id, delta: row.delta }));
}

/** 실시간 누적 점수 (이름표 옆에 표시할 용도) */
export function useMatchScores(roomId: string): MatchScoreRow[] {
  const [scores, setScores] = useState<MatchScoreRow[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      const { data } = await supabase
        .from("match_scores")
        .select("player_id, score, player:profiles(nickname)")
        .eq("room_id", roomId);
      if (active && data) {
        setScores(
          data.map((d: any) => ({
            player_id: d.player_id,
            nickname: d.player?.nickname ?? "익명",
            score: d.score,
          }))
        );
      }
    }
    load();

    const channel = supabase
      .channel(`match-scores-${roomId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_scores", filter: `room_id=eq.${roomId}` },
        load
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  return scores;
}

/** 목표점수에 도달한 플레이어가 있는지 확인 */
export function findMatchWinner(scores: MatchScoreRow[], targetScore: number): MatchScoreRow | null {
  const reached = scores.filter((s) => s.score >= targetScore);
  if (reached.length === 0) return null;
  // 여러 명이 동시에 넘겼다면 가장 높은 점수를 최종 승자로
  return reached.sort((a, b) => b.score - a.score)[0];
}

/**
 * 매치 종료 확정: 서버(finalize_match RPC)가 match_scores를 직접 확인해서
 * 목표 점수 도달 여부까지 재검증한 뒤 games/game_results에 기록하고 방을 초기화한다.
 * → 클라이언트가 games/game_results 테이블에 직접 insert하던 방식은 폐기
 *   (원하는 점수/순위를 조작해서 리더보드에 넣을 수 있었음)
 * → 이번 매치에 AI 봇이 한 명이라도 있었으면 서버가 알아서 리더보드 기록을 건너뜀
 */
export async function finalizeMatch(roomId: string, playerCount: 3 | 4 | 5): Promise<string | null> {
  const { data, error } = await supabase.rpc("finalize_match", {
    p_room_id: roomId,
    p_player_count: playerCount,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}
