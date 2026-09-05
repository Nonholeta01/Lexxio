"use client";

import { useState } from "react";
import Badge, { type BadgeType } from "./Badge";

const BADGE_INFO: Record<BadgeType, { label: string; desc: string }> = {
  totalScoreKing: {
    label: "총점 1위",
    desc: "20판 이상 플레이한 사람 중, 누적 점수가 가장 높은 사람에게 붙는 배지예요.",
  },
  avgScoreKing: {
    label: "겜잘알 1위",
    desc: "20판 이상 플레이한 사람 중, 게임당 평균 점수가 가장 높은 사람에게 붙는 배지예요.",
  },
  bestSingleMatch: {
    label: "최고점 달인",
    desc: "20판 이상 플레이한 사람 중, 한 라운드에서 가장 높은 점수를 낸 사람에게 붙는 배지예요.",
  },
};

export default function BadgeRow({
  badges,
  size = 14,
}: {
  badges: BadgeType[];
  size?: number;
}) {
  const [info, setInfo] = useState<BadgeType | null>(null);

  if (badges.length === 0) return null;

  return (
    <>
      <span style={{ display: "inline-flex", gap: 3, verticalAlign: "middle" }}>
        {badges.map((b) => (
          <span
            key={b}
            onClick={(e) => {
              e.stopPropagation();
              setInfo(b);
            }}
            style={{ cursor: "pointer", display: "inline-flex" }}
          >
            <Badge type={b} size={size} />
          </span>
        ))}
      </span>

      {info && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 90,
          }}
          onClick={(e) => {
            e.stopPropagation();
            setInfo(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "78%",
              background: "#1c1c22",
              borderRadius: 16,
              padding: 20,
              textAlign: "center",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
              <Badge type={info} size={28} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 800, margin: "0 0 8px" }}>{BADGE_INFO[info].label}</p>
            <p style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.5, margin: 0 }}>{BADGE_INFO[info].desc}</p>
            <button
              onClick={() => setInfo(null)}
              style={{
                marginTop: 16,
                width: "100%",
                padding: "10px 0",
                borderRadius: 10,
                border: "none",
                background: "#e0304a",
                color: "#fff",
                fontWeight: 700,
              }}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
