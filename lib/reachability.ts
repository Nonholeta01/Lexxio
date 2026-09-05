import { ComboCategory, Suit, type Card, type HandEval } from "./lexioEngine";

/**
 * "바닥에 나온 패 역사"를 더 이상 추적하지 않기로 했으므로(직전 패만 보여주는 방식으로 변경),
 * 자동으로 턴을 넘겨줄 수 있는 경우는 "그 어떤 상황이든 수학적으로 무조건 최강"인
 * 몇 가지 특수한 조합뿐이다. (덱 전체에 "2"는 4장뿐이라는 사실만으로 증명 가능함)
 *
 * - 싱글: 2해 — 존재하는 카드 중 절대적으로 가장 강한 한 장
 * - 페어: 2와 2로 이루어지고 그중 하나가 해 — 남은 2 두 장으로 이보다 센 페어를 절대 못 만듦
 * - 트리플: 2 세 장(문양 무관) — 2는 4장뿐이라 남는 건 1장, 대적할 트리플 자체가 성립 불가
 * - 포카드: 2 네 장 — 애초에 세상에 하나뿐인 조합
 */
export function isComboUnbeatable(currentEval: HandEval): boolean {
  const cards = currentEval.cards;

  if (currentEval.category === ComboCategory.Single) {
    const c = cards[0];
    return c.number === 2 && c.suit === Suit.Sun;
  }

  if (currentEval.category === ComboCategory.Pair) {
    return cards.every((c) => c.number === 2) && cards.some((c) => c.suit === Suit.Sun);
  }

  if (currentEval.category === ComboCategory.Triple) {
    return cards.every((c) => c.number === 2);
  }

  if (currentEval.category === ComboCategory.FourCard) {
    return cards.filter((c) => c.number === 2).length === 4;
  }

  return false;
}
