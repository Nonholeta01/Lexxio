import { createDeck, canBeat, ComboCategory, type Card, type PlayerCount, type HandEval } from "./lexioEngine";
import { generateCandidates } from "./botAI";

/**
 * 이번 라운드에 "바닥에 이미 나온 카드들"만 갖고, 지금 나온 조합을 이길 수 있는 조합이
 * 이론상 아직 세상 어딘가(=누군가의 손패)에 남아있는지 확인한다.
 * 남의 손패는 절대 들여다보지 않고, 오직 "전체 덱 - 바닥에 나온 카드" 계산만으로 판단한다.
 *
 * - 1/2/3장(싱글/페어/트리플)만 정확하게 계산해서 판정한다.
 * - 5장 조합은 일반적으로는 판정하지 않되, "2 포카드"만 예외적으로 무조건 최강으로 취급한다.
 *   (이론상 스트레이트플러시가 이걸 이길 수도 있지만, 그 경우까지는 계산하지 않기로 함)
 */
export function isComboUnbeatable(
  currentEval: HandEval,
  playedThisRound: Card[],
  playerCount: PlayerCount
): boolean {
  // "2 포카드" 특례: 무조건 최강으로 취급하고 바로 턴을 돌려준다
  if (currentEval.category === ComboCategory.FourCard) {
    const quadIsTwo = currentEval.cards.filter((c) => c.number === 2).length === 4;
    if (quadIsTwo) return true;
  }

  // 1/2/3장 조합만 계산 (5장은 위 특례 말고는 판정하지 않음)
  if (currentEval.count !== 1 && currentEval.count !== 2 && currentEval.count !== 3) {
    return false;
  }

  const fullDeck = createDeck(playerCount);
  const playedIds = new Set(playedThisRound.map((c) => `${c.number}-${c.suit}`));
  const remaining = fullDeck.filter((c) => !playedIds.has(`${c.number}-${c.suit}`));

  const candidates = generateCandidates(remaining, playerCount, currentEval.count);
  const canAnyoneBeatIt = candidates.some((c) => canBeat(c.evalResult, currentEval));

  return !canAnyoneBeatIt;
}
