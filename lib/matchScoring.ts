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
 * 한 라운드가 끝났을 때 각 플레이어의 점수 변화량(delta)을 반영한다.
 * (라운드별 실제 득점 계산식은 게임 화면 쪽 로직에서 결정해서 넘겨줌)
 */
export async function applyRoundScores(
  roomId: string,
  deltas: { playerId: string; delta: number }[]
): Promise<void> {
  await Promise.all(
    deltas.map(({ playerId, delta }) =>
      supabase.rpc("increment_match_score", {
        p_room_id: roomId,
        p_player_id: playerId,
        p_delta: delta,
      })
    )
  );
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
 * 매치 종료 확정: games/game_results 에 "최종" 기록을 한 번만 남기고
 * match_scores 는 정리한다 (다음 매치를 위해 초기화).
 * → 리더보드에는 매치가 끝났을 때만 반영됨 (라운드마다 기록 X)
 * → 이번 매치에 AI 봇이 한 명이라도 있었으면 리더보드에는 아예 기록하지 않는다.
 */
export async function finalizeMatch(roomId: string, playerCount: 3 | 4 | 5, scores: MatchScoreRow[]) {
  const ranked = [...scores].sort((a, b) => b.score - a.score);

  const { data: seatedPlayers } = await supabase
    .from("room_players")
    .select("player:profiles(is_bot)")
    .eq("room_id", roomId);
  const hasBot = (seatedPlayers ?? []).some((p: any) => p.player?.is_bot);

  let gameId: string | null = null;

  if (!hasBot) {
    const { data: game, error: gameErr } = await supabase
      .from("games")
      .insert({ room_id: roomId, player_count: playerCount })
      .select()
      .single();
    if (gameErr) throw gameErr;
    gameId = game.id;

    const results = ranked.map((s, idx) => ({
      game_id: game.id,
      player_id: s.player_id,
      rank: idx + 1,
      score: s.score,
    }));

    const { error: resultsErr } = await supabase.from("game_results").insert(results);
    if (resultsErr) throw resultsErr;
  }

  await supabase.from("match_scores").delete().eq("room_id", roomId);
  await supabase.from("play_log").delete().eq("room_id", roomId);
  // 매치가 끝나면 방은 다시 "대기중" 상태로 돌아가 처음 방 화면 그대로 보여진다.
  // (같은 인원으로 바로 재대결하고 싶으면 방장이 시작 버튼만 다시 누르면 됨)
  await supabase.from("rooms").update({ status: "waiting" }).eq("id", roomId);

  return gameId;
}
