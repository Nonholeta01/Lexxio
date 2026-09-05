"use client";

export function RulesTriggerButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.15)",
        background: "rgba(255,255,255,0.06)",
        color: "#fff",
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      📖 규칙
    </button>
  );
}

export default function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 80,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxHeight: "82%",
          overflowY: "auto",
          background: "#1c1c22",
          borderRadius: 16,
          padding: 20,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>렉시오 규칙</h2>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "#fff", opacity: 0.6, fontSize: 16 }}
          >
            ✕
          </button>
        </div>

        <Section title="🎯 목표">
          내 손패를 남들보다 먼저, 그리고 더 잘 털어내는 카드 게임이야. 매치는 여러 라운드로
          이어지고, 방장이 정한 목표점수에 누군가 먼저 도달하면 매치가 끝나.
        </Section>

        <Section title="🀄 패 구성">
          구름·별·달·해 4가지 문양이 있고, 인원수에 따라 쓰는 숫자 범위가 달라져.
          <ul style={ulStyle}>
            <li>3인: 1~9 (36장, 인당 12장)</li>
            <li>4인: 1~13 (52장, 인당 13장)</li>
            <li>5인: 1~15 (60장, 인당 12장)</li>
          </ul>
        </Section>

        <Section title="👑 선(先) 정하기">
          1라운드는 <b>구름 3</b>을 가진 사람이 무조건 선이 돼. 그 다음 라운드부터는 직전 라운드
          승자가 선이 돼. 선은 손패 중 원하는 조합을 자유롭게 낼 수 있어.
        </Section>

        <Section title="🔢 숫자·문양 서열">
          숫자는 <b>3-4-5-...-15-1-2</b> 순서로 강해지고(3이 제일 약하고 2가 제일 강함),
          같은 숫자끼리는 문양으로 비교해 <b>구름 &lt; 별 &lt; 달 &lt; 해</b> 순으로 강해져.
        </Section>

        <Section title="▶️ 진행 방법">
          누군가 조합을 내면, 다음 사람은 <b>같은 장수</b>이면서 <b>더 강한</b> 조합을 내야 해.
          낼 수 없거나 전략적으로 안 내고 싶으면 <b>패스</b>할 수 있어. 나머지 전원이 패스하면
          마지막으로 낸 사람에게 다시 선이 돌아오고, 그 사람은 새 조합을 자유롭게 낼 수 있어.
        </Section>

        <Section title="🃏 조합 종류 (장수가 많을수록 하위 서열도 있음)">
          <ul style={ulStyle}>
            <li>싱글 (1장)</li>
            <li>페어 (2장, 같은 숫자)</li>
            <li>트리플 (3장, 같은 숫자)</li>
            <li>
              5장 조합 — 스트레이트 &lt; 플러시 &lt; 풀하우스 &lt; 포카드 &lt; 스트레이트플러시
              순으로 강함
            </li>
          </ul>
          <p style={{ fontSize: 12, opacity: 0.6, margin: "4px 0 0" }}>
            스트레이트는 1-2-3-4-5부터 시작해서, 가장 큰 숫자와 1이 함께 묶이는 조합
            (예: 5인 기준 12-13-14-15-1)까지만 인정돼. 풀하우스는 트리플 숫자로만 비교하고,
            포카드는 나머지 1장 숫자는 상관없어.
          </p>
        </Section>

        <Section title="🏁 라운드 종료 & 점수">
          누군가 손패를 다 내면 그 라운드가 끝나. 1등은 <b>나머지 사람들 잔패 수의 합</b>만큼
          점수를 얻고, 나머지는 <b>자기 잔패 수만큼</b> 점수를 잃어. 방에서 "2 가중치"를 켰다면,
          2를 들고 진 사람은 그 손해가 2를 가진 장수만큼 제곱으로 배가돼(2장이면 4배).
        </Section>

        <Section title="⚙️ 방에서 정하는 옵션">
          <ul style={ulStyle}>
            <li>목표점수 — 이 점수에 먼저 도달하면 매치 종료</li>
            <li>턴 제한시간 — 시간 안에 못 내면 자동 패스 (1라운드 첫 턴만 60초)</li>
            <li>2 가중치 적용 — 위 설명대로 2를 들고 지면 손해가 배가됨</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>{title}</p>
      <div style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.85 }}>{children}</div>
    </div>
  );
}

const ulStyle: React.CSSProperties = { margin: "4px 0 0", paddingLeft: 18 };
