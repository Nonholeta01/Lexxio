"use client";

import { useCardTheme } from "@/lib/cardTheme";

export default function CardThemeToggleButton() {
  const [theme, toggle] = useCardTheme();

  return (
    <button
      onClick={toggle}
      aria-label="패 스킨 전환"
      style={{
        padding: "6px 10px",
        borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.15)",
        background: "rgba(255,255,255,0.06)",
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: theme === "dark" ? "#161619" : "#ffffff",
          border: "1px solid rgba(255,255,255,0.4)",
        }}
      />
      {theme === "dark" ? "검은 패" : "흰 패"}
    </button>
  );
}
