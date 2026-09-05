import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import type { Card } from "./lexioEngine";

export interface PlayLogEntry {
  id: string;
  playerId: string;
  cards: Card[];
}

/** 특정 방의 "이번 라운드"에 나온 패를 낸 순서대로 실시간으로 가져온다 */
export function usePlayLog(roomId: string, roundNumber: number): PlayLogEntry[] {
  const [entries, setEntries] = useState<PlayLogEntry[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      const { data } = await supabase
        .from("play_log")
        .select("id, player_id, cards")
        .eq("room_id", roomId)
        .eq("round_number", roundNumber)
        .order("created_at", { ascending: true });
      if (active) {
        setEntries((data ?? []).map((d: any) => ({ id: d.id, playerId: d.player_id, cards: d.cards as Card[] })));
      }
    }
    load();

    const channel = supabase
      .channel(`play-log-${roomId}-${roundNumber}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "play_log",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row.round_number !== roundNumber) return;
          setEntries((prev) => [...prev, { id: row.id, playerId: row.player_id, cards: row.cards as Card[] }]);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [roomId, roundNumber]);

  return entries;
}
