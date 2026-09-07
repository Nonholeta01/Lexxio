import { supabase } from "./supabaseClient";
import type { Card } from "./lexioEngine";

/** "턴 제한시간 없음"을 표현하는 값 — 사실상 무제한이 되도록 아주 큰 초 단위를 씀 */
export const NO_TIME_LIMIT = 999999;

export interface TableState {
  room_id: string;
  round_number: number;
  current_combo: Card[] | null;
  current_combo_player_id: string | null;
  current_turn_seat: number;
  passed_seats: number[];
  turn_deadline: string | null;
  round_winner_id: string | null;
  paused_by: string | null;
  advance_requested: boolean;
}

/**
 * 방장이 새 라운드를 시작한다.
 * 셔플/분배와 "3구름 가진 사람이 선" 판정은 이제 전부 서버(start_round RPC)가 직접 수행한다.
 * (예전엔 클라이언트가 dealHands()로 손패를 만들어 그대로 서버에 제출했는데,
 *  방장 클라이언트가 조작되면 원하는 사람에게 원하는 패를 줄 수 있는 구조였어서 폐기함)
 * - turnSeconds: 이번에 배부된 첫 턴에 줄 제한시간 (1라운드는 60초, 이후엔 방 설정값)
 */
export async function startNewRound(
  roomId: string,
  roundNumber: number,
  turnSeconds: number
): Promise<void> {
  const { error } = await supabase.rpc("start_round", {
    p_room_id: roomId,
    p_round_number: roundNumber,
    p_turn_seconds: turnSeconds,
  });
  if (error) throw error;
}

export async function fetchMyHand(roomId: string): Promise<Card[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const { data, error } = await supabase
    .from("player_hands")
    .select("cards")
    .eq("room_id", roomId)
    .eq("player_id", userData.user.id)
    .maybeSingle();
  if (error) throw error;
  return (data?.cards as Card[]) ?? [];
}

export async function fetchTableState(roomId: string): Promise<TableState | null> {
  const { data, error } = await supabase
    .from("game_table_state")
    .select("*")
    .eq("room_id", roomId)
    .maybeSingle();
  if (error) throw error;
  return data as TableState | null;
}

export async function playCards(roomId: string, cards: Card[]): Promise<void> {
  const { error } = await supabase.rpc("play_cards", { p_room_id: roomId, p_cards: cards });
  if (error) throw error;
}

export async function passTurn(roomId: string): Promise<void> {
  const { error } = await supabase.rpc("pass_turn", { p_room_id: roomId });
  if (error) throw error;
}

/**
 * 방장이 응답 없이 사라졌을 때(브라우저 강제종료 등), 접속해 있는 다른 참가자가
 * 스스로 방장을 이어받는다. (정상적으로 "나가기"를 눌러서 넘기는 leaveRoom()의 위임과는 별개 경로)
 */
export async function claimHost(roomId: string): Promise<void> {
  const { error } = await supabase.rpc("claim_host", { p_room_id: roomId });
  if (error) throw error;
}

/** 라운드가 끝난 뒤에만 호출 가능 — 전원의 남은 패를 공개해서 점수 계산에 사용 */
export async function revealRoundHands(
  roomId: string
): Promise<{ player_id: string; cards: Card[] }[]> {
  const { data, error } = await supabase.rpc("reveal_round_hands", { p_room_id: roomId });
  if (error) throw error;
  return (data ?? []).map((d: any) => ({ player_id: d.player_id, cards: d.cards as Card[] }));
}

/** 일시정지 걸기 (참가자 누구나) */
export async function pauseGame(roomId: string): Promise<void> {
  const { error } = await supabase.rpc("pause_game", { p_room_id: roomId });
  if (error) throw error;
}

/** 일시정지 해제 (건 사람만 가능, 서버에서 검증) */
export async function unpauseGame(roomId: string, turnSeconds: number): Promise<void> {
  const { error } = await supabase.rpc("unpause_game", {
    p_room_id: roomId,
    p_turn_seconds: turnSeconds,
  });
  if (error) throw error;
}

/** 중도 포기: 나가는 사람은 페널티 점수로 확정, 매치 즉시 종료 */
export async function quitMatchWithPenalty(roomId: string, penalty = -50): Promise<void> {
  const { error } = await supabase.rpc("quit_match_with_penalty", {
    p_room_id: roomId,
    p_penalty: penalty,
  });
  if (error) throw error;
}

/** 라운드 승자가 "다음으로"를 눌러 대기시간을 건너뛰고 싶을 때 */
export async function requestAdvance(roomId: string): Promise<void> {
  const { error } = await supabase.rpc("request_advance", { p_room_id: roomId });
  if (error) throw error;
}

/** 방장이 빈 자리에 AI 봇 추가 */
export async function addBot(
  roomId: string,
  seatNo: number,
  difficulty: "easy" | "medium"
): Promise<string> {
  const { data, error } = await supabase.rpc("add_bot", {
    p_room_id: roomId,
    p_seat_no: seatNo,
    p_difficulty: difficulty,
  });
  if (error) throw error;
  return data as string;
}

/** 방장이 봇의 손패를 확인 (봇 대신 수를 두기 위함) */
export async function getBotHand(roomId: string, botId: string): Promise<Card[]> {
  const { data, error } = await supabase.rpc("get_bot_hand", { p_room_id: roomId, p_bot_id: botId });
  if (error) throw error;
  return (data ?? []) as Card[];
}

/** 방장이 봇을 대신해서 패를 냄 */
export async function botPlayCards(roomId: string, botId: string, cards: Card[]): Promise<void> {
  const { error } = await supabase.rpc("bot_play_cards", {
    p_room_id: roomId,
    p_bot_id: botId,
    p_cards: cards,
  });
  if (error) throw error;
}

/** 방장이 봇을 대신해서 패스 */
export async function botPassTurn(roomId: string, botId: string): Promise<void> {
  const { error } = await supabase.rpc("bot_pass_turn", { p_room_id: roomId, p_bot_id: botId });
  if (error) throw error;
}

/** 방장이 사람(강퇴) 또는 AI(제거)를 방에서 내보냄 */
export async function removePlayer(roomId: string, playerId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_player", { p_room_id: roomId, p_player_id: playerId });
  if (error) throw error;
}

/** 각 참가자의 남은 패 "개수"만 조회 (실제 카드는 절대 안 보임) */
export async function getHandCounts(roomId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("get_hand_counts", { p_room_id: roomId });
  if (error) throw error;
  const map: Record<string, number> = {};
  (data ?? []).forEach((row: any) => {
    map[row.player_id] = row.card_count;
  });
  return map;
}

/** 바닥패만으로 "이제 아무도 못 이김"이 확인됐을 때, 곧바로 낸 사람에게 턴을 돌려줌 */
export async function forceReturnToLeader(roomId: string): Promise<void> {
  const { error } = await supabase.rpc("force_return_to_leader", { p_room_id: roomId });
  if (error) throw error;
}
