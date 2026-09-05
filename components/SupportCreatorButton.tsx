"use client";

// TODO: 아래 URL을 실제로 쓰는 후원 링크로 바꿔줘.
// - 토스 송금 링크, 카카오페이 송금 링크, buymeacoffee.com/본인아이디 등 뭐든 가능
const SUPPORT_URL = "https://buymeacoffee.com/holicssong";

export default function SupportCreatorButton({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        margin: compact ? 0 : "12px 16px",
        padding: compact ? "10px 4px" : "10px 0",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.15)",
        background: "rgba(255,255,255,0.04)",
        color: "#fff",
        fontSize: compact ? 12 : 13,
        fontWeight: 700,
        textDecoration: "none",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      ☕ {compact ? "커피 사주기" : "제작자 커피 사주기"}
    </a>
  );
}
