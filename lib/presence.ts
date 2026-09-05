import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { getCurrentProfile } from "./auth";

export interface OnlineUser {
  id: string;
  nickname: string;
}

/**
 * Supabase Realtime Presence로 "현재 로비에 접속해 있는 사람" 목록을 관리한다.
 * 별도 DB 테이블 없이 소켓 연결 상태만으로 동작 (연결 끊기면 자동으로 목록에서 빠짐).
 */
export function useOnlineUsers(): OnlineUser[] {
  const [users, setUsers] = useState<OnlineUser[]>([]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const profile = await getCurrentProfile();
      if (!profile || cancelled) return; // 언마운트 됐으면(개발모드 이중실행 등) 채널 생성 자체를 스킵

      channel = supabase.channel("lobby-presence", {
        config: { presence: { key: profile.id } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel!.presenceState<{ nickname: string }>();
          const list: OnlineUser[] = Object.entries(state).map(([id, entries]) => ({
            id,
            nickname: entries[0]?.nickname ?? "익명",
          }));
          setUsers(list);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && !cancelled) {
            await channel!.track({ nickname: profile.nickname });
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return users;
}
