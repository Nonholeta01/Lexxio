"use client";

export type BadgeType = "totalScoreKing" | "avgScoreKing" | "bestSingleMatch";

const BADGE_META: Record<BadgeType, { label: string; color: string }> = {
  totalScoreKing: { label: "총점 1위", color: "#f2c14e" }, // 금색 트로피
  avgScoreKing: { label: "겜잘알 1위", color: "#8b5cf6" }, // 보라 두뇌
  bestSingleMatch: { label: "최고점 달인", color: "#f97316" }, // 주황 별
};

export default function Badge({ type, size = 18 }: { type: BadgeType; size?: number }) {
  const { label, color } = BADGE_META[type];

  return (
    <span
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      {type === "totalScoreKing" && <TrophyIcon color={color} size={size} />}
      {type === "avgScoreKing" && <BrainIcon color={color} size={size} />}
      {type === "bestSingleMatch" && <BurstStarIcon color={color} size={size} />}
    </span>
  );
}

function TrophyIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M6 3h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V3Z"
        fill={color}
        stroke={color}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M4 4H2v2a4 4 0 0 0 4 4" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M20 4h2v2a4 4 0 0 1-4 4" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <rect x="10" y="12" width="4" height="4" fill={color} />
      <rect x="7" y="18" width="10" height="2.5" rx="1" fill={color} />
    </svg>
  );
}

function BrainIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V16a4 4 0 0 0 4 4h1V4H9Z"
        fill={color}
        opacity="0.9"
      />
      <path
        d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V16a4 4 0 0 1-4 4h-1V4h1Z"
        fill={color}
        opacity="0.6"
      />
    </svg>
  );
}

function BurstStarIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2l1.9 5.3L19 5l-2.3 5 5.3 1.9-5.3 1.9L19 19l-5.1-2.3L12 22l-1.9-5.3L5 19l2.3-5L2 11.9l5.3-1.9L5 5l5.1 2.3L12 2Z"
        fill={color}
      />
    </svg>
  );
}
