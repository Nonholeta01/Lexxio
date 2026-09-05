"use client";

import { useState } from "react";
import { signUp, signIn } from "@/lib/auth";
import { useRouter } from "next/navigation";

type Mode = "login" | "signup";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const result =
      mode === "signup" ? await signUp(email, password, nickname) : await signIn(email, password);

    setLoading(false);
    setMessage(result.message);

    if (result.ok) {
      if (mode === "signup") {
        setMode("login"); // 가입 후 바로 로그인하도록 전환
      } else {
        router.push("/lobby");
      }
    }
  }

  return (
    <div style={{ padding: "48px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Lexxio</h1>
        <p style={{ opacity: 0.6, marginTop: 4, fontSize: 14 }}>
          친구들과 즐기는 렉씨오
        </p>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <TabButton active={mode === "signup"} onClick={() => setMode("signup")}>
          회원가입
        </TabButton>
        <TabButton active={mode === "login"} onClick={() => setMode("login")}>
          로그인
        </TabButton>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {mode === "signup" && (
          <Field label="닉네임">
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="2~12자, 한글/영문/숫자"
              required
              style={inputStyle}
            />
          </Field>
        )}

        <Field label="이메일">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
        </Field>

        <Field label="비밀번호">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={inputStyle}
          />
        </Field>

        {message && (
          <p style={{ fontSize: 13, color: message.includes("완료") || message.includes("성공") ? "#4ade80" : "#f87171" }}>
            {message}
          </p>
        )}

        <button type="submit" disabled={loading} style={submitStyle}>
          {loading ? "처리 중..." : mode === "signup" ? "가입하기" : "로그인"}
        </button>
      </form>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      style={{
        flex: 1,
        padding: "10px 0",
        borderRadius: 10,
        border: "none",
        background: active ? "#fff" : "rgba(255,255,255,0.08)",
        color: active ? "#111" : "#fff",
        fontWeight: 700,
        fontSize: 14,
      }}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, opacity: 0.85 }}>
      {label}
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.05)",
  color: "#fff",
  fontSize: 15,
  outline: "none",
};

const submitStyle: React.CSSProperties = {
  marginTop: 8,
  padding: "14px 0",
  borderRadius: 12,
  border: "none",
  background: "#e0304a",
  color: "#fff",
  fontWeight: 800,
  fontSize: 16,
};
