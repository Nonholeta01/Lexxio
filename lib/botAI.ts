import {
  Suit,
  evaluateCombo,
  canBeat,
  buildStraightWindows,
  type Card,
  type PlayerCount,
  type HandEval,
} from "./lexioEngine";

export type BotDifficulty = "easy" | "medium";

interface Candidate {
  cards: Card[];
  evalResult: HandEval;
}

function groupByNumber(hand: Card[]): Map<number, Card[]> {
  const map = new Map<number, Card[]>();
  for (const c of hand) {
    const list = map.get(c.number) ?? [];
    list.push(c);
    map.set(c.number, list);
  }
  return map;
}

function maxNumberFor(playerCount: PlayerCount): number {
  return playerCount === 3 ? 9 : playerCount === 4 ? 13 : 15;
}

/** 손패에서 낼 수 있는 모든 유효 조합 후보를 생성한다 (requiredCount가 있으면 그 장수만) */
export function generateCandidates(
  hand: Card[],
  playerCount: PlayerCount,
  requiredCount: number | null
): Candidate[] {
  const candidates: Candidate[] = [];
  const groups = groupByNumber(hand);

  function tryAdd(cards: Card[]) {
    const evalResult = evaluateCombo(cards, playerCount);
    if (evalResult) candidates.push({ cards, evalResult });
  }

  if (requiredCount === null || requiredCount === 1) {
    hand.forEach((c) => tryAdd([c]));
  }
  if (requiredCount === null || requiredCount === 2) {
    groups.forEach((cards) => {
      if (cards.length >= 2) tryAdd(cards.slice(0, 2));
    });
  }
  if (requiredCount === null || requiredCount === 3) {
    groups.forEach((cards) => {
      if (cards.length >= 3) tryAdd(cards.slice(0, 3));
    });
  }
  if (requiredCount === null || requiredCount === 5) {
    // 플러시
    const bySuit = new Map<Suit, Card[]>();
    hand.forEach((c) => {
      const list = bySuit.get(c.suit) ?? [];
      list.push(c);
      bySuit.set(c.suit, list);
    });
    bySuit.forEach((cards) => {
      if (cards.length >= 5) tryAdd(cards.slice(0, 5));
    });

    // 풀하우스 (트리플 + 다른 숫자 페어)
    const triples = [...groups.entries()].filter(([, c]) => c.length >= 3);
    const pairs = [...groups.entries()].filter(([, c]) => c.length >= 2);
    triples.forEach(([tNum, tCards]) => {
      pairs.forEach(([pNum, pCards]) => {
        if (pNum !== tNum) tryAdd([...tCards.slice(0, 3), ...pCards.slice(0, 2)]);
      });
    });

    // 포카드 (쿼드 + 아무 카드 1장)
    groups.forEach((cards, num) => {
      if (cards.length >= 4) {
        const kicker = hand.find((c) => c.number !== num);
        if (kicker) tryAdd([...cards.slice(0, 4), kicker]);
      }
    });

    // 스트레이트 / 스트레이트플러시
    const windows = buildStraightWindows(maxNumberFor(playerCount));
    const suits = [Suit.Cloud, Suit.Star, Suit.Moon, Suit.Sun];
    windows.forEach((window) => {
      const picks: Card[] = [];
      let ok = true;
      for (const num of window) {
        const avail = groups.get(num);
        if (!avail || avail.length === 0) {
          ok = false;
          break;
        }
        picks.push(avail[0]);
      }
      if (ok) tryAdd(picks);

      suits.forEach((suit) => {
        const sfPicks: Card[] = [];
        let sfOk = true;
        for (const num of window) {
          const card = (groups.get(num) ?? []).find((c) => c.suit === suit);
          if (!card) {
            sfOk = false;
            break;
          }
          sfPicks.push(card);
        }
        if (sfOk) tryAdd(sfPicks);
      });
    });
  }

  return candidates;
}

function sortWeakest(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort(
    (a, b) => a.evalResult.primaryRank - b.evalResult.primaryRank || a.evalResult.secondaryRank - b.evalResult.secondaryRank
  );
}

function pickWeakestAvoiding2(candidates: Candidate[]): Candidate {
  const sorted = sortWeakest(candidates);
  const withoutTwo = sorted.filter((c) => !c.cards.some((card) => card.number === 2));
  return withoutTwo[0] ?? sorted[0];
}

/**
 * 봇이 낼 패를 고른다. null이면 패스.
 * - easy: 유효한 것 중 가장 약한 걸 아무 생각 없이 냄
 * - medium: 2는 최대한 아끼고, 선일 땐 작은 조합부터 처리하다가 패가 얼마 안 남으면 한 번에 털어내려 함
 */
export function chooseBotMove(
  hand: Card[],
  playerCount: PlayerCount,
  currentCombo: HandEval | null,
  difficulty: BotDifficulty
): Card[] | null {
  const requiredCount = currentCombo ? currentCombo.count : null;
  const candidates = generateCandidates(hand, playerCount, requiredCount);
  const valid = currentCombo ? candidates.filter((c) => canBeat(c.evalResult, currentCombo)) : candidates;

  if (valid.length === 0) return null;

  if (difficulty === "easy") {
    return sortWeakest(valid)[0].cards;
  }

  // ---- medium ----
  if (currentCombo) {
    return pickWeakestAvoiding2(valid).cards;
  }

  // 선일 때: 손패가 얼마 안 남았으면 한 번에 많이 내는 쪽을 선호
  if (hand.length <= 5) {
    const sorted = [...valid].sort(
      (a, b) => b.cards.length - a.cards.length || a.evalResult.primaryRank - b.evalResult.primaryRank
    );
    return sorted[0].cards;
  }

  // 아니면 가장 적은 장수(싱글/페어 등)부터 처리, 2는 최대한 아낌
  const minCount = Math.min(...valid.map((c) => c.cards.length));
  const sameCount = valid.filter((c) => c.cards.length === minCount);
  return pickWeakestAvoiding2(sameCount).cards;
}
