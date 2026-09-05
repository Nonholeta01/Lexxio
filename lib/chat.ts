import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";

export interface ChatMessage {
  id: string;
  sender_id: string;
  sender_nickname: string;
  content: string;
  created_at: string;
}

async function fetchHistory(roomId: string | null): Promise<ChatMessage[]> {
  let query = supabase
    .from("messages")
    .select("id, sender_id, content, created_at, sender:profiles(nickname)")
    .order("created_at", { ascending: true })
    .limit(50);

  query = roomId ? query.eq("room_id", roomId) : query.is("room_id", null);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((m: any) => ({
    id: m.id,
    sender_id: m.sender_id,
    sender_nickname: m.sender?.nickname ?? "익명",
    content: m.content,
    created_at: m.created_at,
  }));
}

/** roomId === null 이면 로비 전체 채팅, 값이 있으면 그 방 전용 채팅 */
export function useChat(roomId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    let active = true;
    fetchHistory(roomId).then((history) => {
      if (active) setMessages(history);
    });

    const channel = supabase
      .channel(`chat-${roomId ?? "lobby"}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: roomId ? `room_id=eq.${roomId}` : "room_id=is.null",
        },
        async (payload) => {
          const row = payload.new as any;
          const { data: sender } = await supabase
            .from("profiles")
            .select("nickname")
            .eq("id", row.sender_id)
            .single();
          setMessages((prev) => [
            ...prev,
            {
              id: row.id,
              sender_id: row.sender_id,
              sender_nickname: sender?.nickname ?? "익명",
              content: row.content,
              created_at: row.created_at,
            },
          ]);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      await supabase
        .from("messages")
        .insert({ room_id: roomId, sender_id: userData.user.id, content: trimmed });
    },
    [roomId]
  );

  return { messages, sendMessage };
}
