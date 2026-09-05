import { supabase } from "./supabaseClient";

const NICKNAME_CHAR_REGEX = /^[가-힣a-zA-Z0-9]{2,}$/;
const MAX_NICKNAME_WEIGHT = 12; // 한글 1자=2, 영문/숫자 1자=1 → 한글 6자 또는 영문/숫자 12자까지

/** 한글은 2, 영문/숫자는 1로 계산한 "무게" — 한글 6자 == 영문/숫자 12자가 같은 한도가 되게 함 */
function nicknameWeight(nickname: string): number {
  let weight = 0;
  for (const ch of nickname) {
    weight += /[가-힣]/.test(ch) ? 2 : 1;
  }
  return weight;
}

export interface AuthResult {
  ok: boolean;
  message: string;
}

/** 닉네임 중복 여부 확인 */
export async function isNicknameTaken(nickname: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("nickname", nickname)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/** 이메일 + 비밀번호 + 닉네임으로 회원가입 */
export async function signUp(
  email: string,
  password: string,
  nickname: string
): Promise<AuthResult> {
  if (!NICKNAME_CHAR_REGEX.test(nickname)) {
    return { ok: false, message: "닉네임은 한글/영문/숫자로 2자 이상 입력해줘." };
  }
  if (nicknameWeight(nickname) > MAX_NICKNAME_WEIGHT) {
    return { ok: false, message: "닉네임은 한글 6자 또는 영문/숫자 12자 이내여야 해." };
  }
  if (password.length < 6) {
    return { ok: false, message: "비밀번호는 6자 이상이어야 해." };
  }

  const taken = await isNicknameTaken(nickname);
  if (taken) {
    return { ok: false, message: "이미 사용 중인 닉네임이야." };
  }

  // nickname 은 raw_user_meta_data 로 전달 → DB 트리거(handle_new_user)가
  // profiles 테이블에 자동으로 넣어줌 (schema.sql 참고)
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nickname } },
  });

  if (error) {
    if (error.message.includes("already registered")) {
      return { ok: false, message: "이미 가입된 이메일이야." };
    }
    return { ok: false, message: error.message };
  }

  return { ok: true, message: "가입 완료! 바로 로그인해서 시작할 수 있어." };
}

/** 이메일 + 비밀번호로 로그인 */
export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, message: "이메일 또는 비밀번호가 올바르지 않아." };
  }
  return { ok: true, message: "로그인 성공" };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getCurrentProfile() {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, nickname")
    .eq("id", userData.user.id)
    .single();

  return profile;
}
