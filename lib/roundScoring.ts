import type { Card } from "./lexioEngine";

export interface RoundHandResult {
  playerId: string;
  remainingCards: Card[]; // 그 라운드가 끝났을 때 이 플레이어에게 남아있던 패
}

export interface RoundScoreDelta {
  playerId: string;
  delta: number;
}

/**
 * 라운드 채점 규칙
 * - 1등(패 0장)은 항상 "나머지 플레이어들의 남은 패 수를 단순 합산"한 만큼 +점수
 *   → applyTwoWeight 여부와 무관하게 1등의 획득 점수는 항상 단순 합 (제로섬은 보장 안 됨)
 * - 나머지는 자기 남은 패 수만큼 -점수
 * - applyTwoWeight = true 이면, 숫자 "2"를 들고 진 사람은
 *   잃는 점수가 (2를 가진 장수)제곱만큼 배가됨: 잔패수 × 2^(보유한 2의 개수)
 *
 * 예) 3인, 1등 0장 / 2등 4장(2 한 장 포함) / 3등 7장
 *   가중치 미적용: 1등 +11, 2등 -4,  3등 -7   (합계 0, 제로섬)
 *   가중치 적용:   1등 +11, 2등 -8,  3등 -7   (합계 -4, 2등이 2를 든 대가로 더 잃음)
 */
export function computeRoundScores(
  results: RoundHandResult[],
  applyTwoWeight: boolean
): RoundScoreDelta[] {
  const winner = results.find((r) => r.remainingCards.length === 0);
  if (!winner) {
    throw new Error("패를 0장 만든(1등) 플레이어가 없습니다. 라운드가 아직 끝나지 않았을 수 있어요.");
  }

  const losers = results.filter((r) => r.playerId !== winner.playerId);

  const loserDeltas: RoundScoreDelta[] = losers.map((loser) => {
    const remainingCount = loser.remainingCards.length;
    const twoCount = loser.remainingCards.filter((c) => c.number === 2).length;
    const multiplier = applyTwoWeight ? Math.pow(2, twoCount) : 1;
    return { playerId: loser.playerId, delta: -(remainingCount * multiplier) };
  });

  // 1등은 항상 "상대 남은패 수의 단순 합" (가중치 무관, 요청사항 그대로)
  const winnerScore = losers.reduce((sum, l) => sum + l.remainingCards.length, 0);

  return [{ playerId: winner.playerId, delta: winnerScore }, ...loserDeltas];
}
