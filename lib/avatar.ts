import { supabase } from "./supabaseClient";

/** 방/게임 화면에서 고를 수 있는 아이콘 10개 */
export const AVATAR_ICON_OPTIONS = ["🎴", "🦊", "🐱", "🐶", "🐻", "🐼", "🦁", "🐸", "🐵", "🐷"];

/** 내 아바타 아이콘 변경 (본인 프로필만 수정 가능 — RLS로 보장됨) */
export async function updateAvatarIcon(icon: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("로그인이 필요해요.");

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_icon: icon })
    .eq("id", userData.user.id);
  if (error) throw error;
}
