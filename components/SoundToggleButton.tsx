"use client";

import { useSoundMuted } from "@/lib/soundSettings";

export default function SoundToggleButton() {
  const [muted, toggle] = useSoundMuted();

  return (
    <button
      onClick={toggle}
      aria-label={muted ? "소리 켜기" : "소리 끄기"}
      style={{
        position: "absolute",
        right: 12,
        bottom: 12,
        width: 40,
        height: 40,
        borderRadius: "50%",
        border: "1px solid rgba(255,255,255,0.15)",
        background: "rgba(0,0,0,0.5)",
        color: "#fff",
        fontSize: 18,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 40,
      }}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
