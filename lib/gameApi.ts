import { supabase } from "./supabaseClient";
import type { Card, PlayerCount } from "./lexioEngine";
import { dealHands, Suit } from "./lexioEngine";

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
 * 방장이 새 라운드를 시작한다: 인원수에 맞게 셔플/분배 후 서버에 제출.
 * - 1라운드(첫 판)는 "3 구름"을 가진 사람이 무조건 선 — starterSeat 인자를 무시하고 자동 계산.
 * - 2라운드부터는 지난 라운드 승자가 선이 되므로 starterSeat 그대로 사용.
 * - turnSeconds: 이번에 배부된 첫 턴에 줄 제한시간 (1라운드는 60초, 이후엔 방 설정값)
 */
export async function startNewRound(
  roomId: string,
  playerCount: PlayerCount,
  seatedPlayers: { seat_no: number; player_id: string }[],
  starterSeat: number,
  roundNumber: number,
  turnSeconds: number
): Promise<void> {
  const hands = dealHands(playerCount);
  const sortedPlayers = seatedPlayers.sort((a, b) => a.seat_no - b.seat_no);
  const payload = sortedPlayers.map((p, idx) => ({ player_id: p.player_id, cards: hands[idx] }));

  let resolvedStarterSeat = starterSeat;
  if (roundNumber === 1) {
    const cloudThreeIdx = hands.findIndex((hand) =>
      hand.some((c) => c.number === 3 && c.suit === Suit.Cloud)
    );
    if (cloudThreeIdx !== -1) {
      resolvedStarterSeat = sortedPlayers[cloudThreeIdx].seat_no;
    }
  }

  const { error } = await supabase.rpc("start_round", {
    p_room_id: roomId,
    p_hands: payload,
    p_starter_seat: resolvedStarterSeat,
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
