"use client";

import { AVATAR_ICON_OPTIONS } from "@/lib/avatar";

export default function AvatarPickerModal({
  currentIcon,
  onSelect,
  onClose,
}: {
  currentIcon: string;
  onSelect: (icon: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "82%",
          background: "#1c1c22",
          borderRadius: 16,
          padding: 20,
        }}
      >
        <p style={{ fontSize: 15, fontWeight: 700, margin: "0 0 14px", textAlign: "center" }}>
          아이콘을 골라줘
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 10,
          }}
        >
          {AVATAR_ICON_OPTIONS.map((icon) => (
            <button
              key={icon}
              onClick={() => onSelect(icon)}
              style={{
                aspectRatio: "1",
                fontSize: 24,
                borderRadius: 12,
                border: icon === currentIcon ? "2px solid #e0304a" : "1px solid rgba(255,255,255,0.12)",
                background: icon === currentIcon ? "rgba(224,48,74,0.2)" : "rgba(255,255,255,0.05)",
              }}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
