import { ComboCategory, SUIT_LABEL, type HandEval } from "./lexioEngine";

/**
 * 화면 상단에 "현재 낸 패"로 보여줄 한국어 표기를 만든다.
 * - 싱글: "5"
 * - 페어: "5원페어"
 * - 트리플: "5트리플"
 * - 스트레이트: "11 스트레이트" (조합에 포함된 카드 중 가장 큰 실제 숫자를 표시)
 * - 플러시: "8 구름 플러시" (모양 + 가장 큰 숫자)
 * - 풀하우스: "10 풀하우스" (트리플 숫자 기준)
 * - 포카드: "7 포카드" (4장 숫자 기준)
 * - 스트레이트플러시: "15 해 스트레이트플러시"
 */
export function formatCombo(hand: HandEval): string {
  const highestNumber = Math.max(...hand.cards.map((c) => c.number));

  switch (hand.category) {
    case ComboCategory.Single:
      return `${hand.cards[0].number}`;

    case ComboCategory.Pair:
      return `${hand.cards[0].number}원페어`;

    case ComboCategory.Triple:
      return `${hand.cards[0].number}트리플`;

    case ComboCategory.Straight:
      return `${highestNumber} 스트레이트`;

    case ComboCategory.Flush: {
      const suitLabel = SUIT_LABEL[hand.cards[0].suit];
      return `${highestNumber} ${suitLabel} 플러시`;
    }

    case ComboCategory.FullHouse: {
      const counts = new Map<number, number>();
      hand.cards.forEach((c) => counts.set(c.number, (counts.get(c.number) ?? 0) + 1));
      const tripleNumber = [...counts.entries()].find(([, count]) => count === 3)![0];
      return `${tripleNumber} 풀하우스`;
    }

    case ComboCategory.FourCard: {
      const counts = new Map<number, number>();
      hand.cards.forEach((c) => counts.set(c.number, (counts.get(c.number) ?? 0) + 1));
      const quadNumber = [...counts.entries()].find(([, count]) => count === 4)![0];
      return `${quadNumber} 포카드`;
    }

    case ComboCategory.StraightFlush: {
      const suitLabel = SUIT_LABEL[hand.cards[0].suit];
      return `${highestNumber} ${suitLabel} 스트레이트플러시`;
    }

    default:
      return "";
  }
}
