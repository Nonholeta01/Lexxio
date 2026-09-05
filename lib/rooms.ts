import { supabase } from "./supabaseClient";

/** 방은 항상 최대 5자리까지 자유롭게 입장 가능 — 실제 게임 인원(3/4/5)은 시작 시점에 모인 인원수로 자동 결정 */
export const MAX_ROOM_SEATS = 5;

export interface RoomListItem {
  id: string;
  invite_code: string;
  max_seats: number;
  status: "waiting" | "playing" | "finished";
  host_nickname: string;
  joined_count: number;
  created_at: string;
}

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 글자(0,O,1,I) 제외
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** 대기 중인 방 목록 (방금 만든 순서대로) */
export async function listWaitingRooms(): Promise<RoomListItem[]> {
  const { data, error } = await supabase
    .from("rooms")
    .select(
      `id, invite_code, player_count, status, created_at,
       host:profiles!rooms_host_id_fkey(nickname),
       room_players(count)`
    )
    .eq("status", "waiting")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    id: r.id,
    invite_code: r.invite_code,
    max_seats: r.player_count, // 대기중엔 항상 5 (최대 자리 수)로 저장돼있음
    status: r.status,
    host_nickname: r.host?.nickname ?? "알 수 없음",
    joined_count: r.room_players?.[0]?.count ?? 0,
    created_at: r.created_at,
  }));
}

/** 방 생성 (만든 사람이 자동으로 0번 좌석에 입장). 인원수는 더 이상 미리 고르지 않고,
 * 시작 시점에 모여있는 인원(3~5명)으로 자동 결정된다 — 그때까진 최대 5자리로 열려있음. */
export async function createRoom(): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("로그인이 필요해요.");

  const { data: room, error } = await supabase
    .from("rooms")
    .insert({
      invite_code: generateInviteCode(),
      host_id: userData.user.id,
      player_count: MAX_ROOM_SEATS,
    })
    .select()
    .single();

  if (error) throw error;

  await joinRoom(room.id);
  return room.id;
}

/** 빈 좌석 중 가장 앞 번호로 입장 (이미 들어가 있는 방이면 그대로 통과) */
export async function joinRoom(roomId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("로그인이 필요해요.");

  // 이미 이 방에 참가해 있다면(예: 본인이 만든 방을 다시 클릭) 새로 넣지 않고 그냥 통과
  const { data: already } = await supabase
    .from("room_players")
    .select("seat_no")
    .eq("room_id", roomId)
    .eq("player_id", userData.user.id)
    .maybeSingle();
  if (already) return;

  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .select("player_count")
    .eq("id", roomId)
    .single();
  if (roomErr) throw roomErr;

  const { data: existing, error: existErr } = await supabase
    .from("room_players")
    .select("seat_no")
    .eq("room_id", roomId);
  if (existErr) throw existErr;

  const takenSeats = new Set((existing ?? []).map((r) => r.seat_no));
  if (takenSeats.size >= room.player_count) {
    throw new Error("방이 가득 찼어요.");
  }

  let seatNo = 0;
  while (takenSeats.has(seatNo)) seatNo++;

  const { error: insertErr } = await supabase
    .from("room_players")
    .insert({ room_id: roomId, player_id: userData.user.id, seat_no: seatNo });
  if (insertErr) throw insertErr;
}

/** 방 나가기. 방장이 나가면 남은 사람 중 자리번호가 가장 빠른 사람에게 방장을 자동으로 넘긴다.
 * 나간 뒤 방이 텅 비면(참가자 0명) 방 자체도 정리(삭제)한다. */
/** 방 나가기. 방장이 나가면 남은 "사람"(AI 제외) 중 자리번호가 가장 빠른 사람에게 방장을 자동으로 넘긴다.
 * 넘길 사람이 없고 AI만 남아있다면 그 AI들을 정리하고 방 자체도 삭제한다.
 * 나간 뒤 방이 텅 비면(참가자 0명) 방 자체도 정리(삭제)한다. */
export async function leaveRoom(roomId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  const { data: room } = await supabase.from("rooms").select("host_id").eq("id", roomId).single();

  if (room && room.host_id === userData.user.id) {
    const { data: others } = await supabase
      .from("room_players")
      .select("player_id, seat_no, player:profiles(is_bot)")
      .eq("room_id", roomId)
      .neq("player_id", userData.user.id)
      .order("seat_no", { ascending: true });

    const nextHuman = (others ?? []).find((o: any) => !o.player?.is_bot);

    if (nextHuman) {
      // 아직 내가 방장인 상태에서 미리 다음 "사람"에게 넘김 (RLS: 방장만 rooms 수정 가능)
      const { error: transferErr } = await supabase
        .from("rooms")
        .update({ host_id: nextHuman.player_id })
        .eq("id", roomId);
      if (transferErr) throw transferErr;
    } else {
      // 넘길 사람이 없음 = 남은 건 AI뿐 → AI를 방장으로 만들지 않고, 미리 정리해버림
      const botIds = (others ?? []).filter((o: any) => o.player?.is_bot).map((o: any) => o.player_id);
      for (const botId of botIds) {
        const { error: removeErr } = await supabase.rpc("remove_player", {
          p_room_id: roomId,
          p_player_id: botId,
        });
        if (removeErr) throw removeErr;
      }
    }
  }

  await supabase
    .from("room_players")
    .delete()
    .eq("room_id", roomId)
    .eq("player_id", userData.user.id);

  const { count } = await supabase
    .from("room_players")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId);

  if (!count) {
    const { error: deleteErr } = await supabase.from("rooms").delete().eq("id", roomId);
    if (deleteErr) throw deleteErr;
  }
}

/** 방 안 참가자 닉네임/좌석 목록 */
export async function getRoomPlayers(roomId: string) {
  const { data, error } = await supabase
    .from("room_players")
    .select("seat_no, player:profiles(id, nickname, is_bot, bot_difficulty, avatar_icon)")
    .eq("room_id", roomId)
    .order("seat_no");
  if (error) throw error;
  return data;
}

/** 방장이 게임 시작 → 상태를 playing 으로 변경 */
export async function startRoom(roomId: string): Promise<void> {
  const { error } = await supabase.from("rooms").update({ status: "playing" }).eq("id", roomId);
  if (error) throw error;
}
