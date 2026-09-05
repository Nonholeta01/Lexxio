/**
 * 렉시오(Lexio) 게임 로직 엔진
 * - 인원(3/4/5명)별 덱 생성
 * - 숫자 서열 / 모양 서열
 * - 조합(싱글/페어/트리플/스트레이트/플러시/풀하우스/포카드/스트레이트플러시) 판정 & 비교
 *
 * 순수 로직만 담당 (UI, 네트워킹 없음) — 서버(검증)와 클라이언트(미리보기) 양쪽에서 재사용 가능
 */

// ---------- 기본 타입 ----------

export type PlayerCount = 3 | 4 | 5;

/** 구름 - 별 - 달 - 해 순으로 강해짐 (0이 가장 약함) */
export enum Suit {
  Cloud = 0, // 구름
  Star = 1, // 별
  Moon = 2, // 달
  Sun = 3, // 해
}

export const SUIT_LABEL: Record<Suit, string> = {
  [Suit.Cloud]: "구름",
  [Suit.Star]: "별",
  [Suit.Moon]: "달",
  [Suit.Sun]: "해",
};

export interface Card {
  /** 실제 숫자 값 (1 ~ maxNumber) */
  number: number;
  suit: Suit;
}

export function cardId(c: Card): string {
  return `${c.number}-${c.suit}`;
}

// ---------- 인원별 규칙 ----------

export interface RuleSet {
  playerCount: PlayerCount;
  /** 사용되는 최고 숫자 (3인=9, 4인=13, 5인=15) */
  maxNumber: number;
  /** 인당 타일 수 */
  tilesPerPlayer: number;
}

export const RULES: Record<PlayerCount, RuleSet> = {
  3: { playerCount: 3, maxNumber: 9, tilesPerPlayer: 12 },
  4: { playerCount: 4, maxNumber: 13, tilesPerPlayer: 13 },
  5: { playerCount: 5, maxNumber: 15, tilesPerPlayer: 12 },
};

export function getRuleSet(playerCount: PlayerCount): RuleSet {
  const rule = RULES[playerCount];
  if (!rule) throw new Error(`지원하지 않는 인원수: ${playerCount}`);
  return rule;
}

// ---------- 숫자 서열 (싱글/페어/트리플/포카드/풀하우스 비교용) ----------
// 서열: 3-4-5-...-maxNumber-1-2  (3이 가장 약하고 2가 가장 강함)

export function buildNumberStrengthOrder(maxNumber: number): number[] {
  const order: number[] = [];
  for (let n = 3; n <= maxNumber; n++) order.push(n);
  order.push(1, 2);
  return order;
}

/** 숫자가 강할수록 큰 값을 반환 (비교용 랭크) */
export function numberStrengthRank(number: number, maxNumber: number): number {
  const order = buildNumberStrengthOrder(maxNumber);
  const idx = order.indexOf(number);
  if (idx === -1) throw new Error(`유효하지 않은 숫자: ${number} (max=${maxNumber})`);
  return idx;
}

// ---------- 스트레이트 시퀀스 (숫자 서열과는 다른, 자연수 순서 + 마지막에 1 랩) ----------
// 예) 5인(15) : 1,2,...,15,1  → 마지막 윈도우 12-13-14-15-1
//     4인(13) : 1,2,...,13,1  → 마지막 윈도우 10-11-12-13-1
//     3인(9)  : 1,2,...,9,1   → 마지막 윈도우 6-7-8-9-1

export function buildStraightSequence(maxNumber: number): number[] {
  const seq: number[] = [];
  for (let n = 1; n <= maxNumber; n++) seq.push(n);
  seq.push(1); // 마지막에 1 랩핑
  return seq;
}

/** 유효한 모든 스트레이트 윈도우 목록 (인덱스가 클수록 강한 스트레이트) */
export function buildStraightWindows(maxNumber: number): number[][] {
  const seq = buildStraightSequence(maxNumber);
  const windows: number[][] = [];
  for (let i = 0; i + 5 <= seq.length; i++) {
    windows.push(seq.slice(i, i + 5));
  }
  return windows;
}

/**
 * 주어진 5개 숫자(중복 없는 5개)가 유효한 스트레이트인지 확인하고,
 * 맞다면 윈도우 인덱스(서열, 클수록 강함)를 반환. 아니면 null.
 */
export function matchStraightWindow(numbers: number[], maxNumber: number): number | null {
  const windows = buildStraightWindows(maxNumber);
  const sortedInput = [...numbers].sort((a, b) => a - b);
  for (let i = 0; i < windows.length; i++) {
    const sortedWindow = [...windows[i]].sort((a, b) => a - b);
    if (
      sortedWindow.length === sortedInput.length &&
      sortedWindow.every((v, idx) => v === sortedInput[idx])
    ) {
      return i;
    }
  }
  return null;
}

// ---------- 덱 생성 & 분배 ----------

export function createDeck(playerCount: PlayerCount): Card[] {
  const { maxNumber } = getRuleSet(playerCount);
  const deck: Card[] = [];
  for (let n = 1; n <= maxNumber; n++) {
    for (const suit of [Suit.Cloud, Suit.Star, Suit.Moon, Suit.Sun]) {
      deck.push({ number: n, suit });
    }
  }
  return deck;
}

function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 인원수에 맞게 덱을 셔플 후 균등 분배 (딱 나누어떨어짐: 3인36/4인52/5인60) */
export function dealHands(playerCount: PlayerCount, rng?: () => number): Card[][] {
  const rule = getRuleSet(playerCount);
  const deck = shuffle(createDeck(playerCount), rng);
  if (deck.length !== rule.tilesPerPlayer * playerCount) {
    throw new Error("덱 크기와 분배 수량이 맞지 않습니다.");
  }
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  deck.forEach((card, idx) => {
    hands[idx % playerCount].push(card);
  });
  return hands;
}

// ---------- 조합(콤보) 판정 ----------

export enum ComboCategory {
  Single = "SINGLE",
  Pair = "PAIR",
  Triple = "TRIPLE",
  Straight = "STRAIGHT",
  Flush = "FLUSH",
  FullHouse = "FULL_HOUSE",
  FourCard = "FOUR_CARD",
  StraightFlush = "STRAIGHT_FLUSH",
}

/** 5장 조합끼리 비교할 때 카테고리 강도 (스트레이트가 가장 약하고 스트레이트플러시가 가장 강함) */
const FIVE_CARD_CATEGORY_POWER: Record<string, number> = {
  [ComboCategory.Straight]: 0,
  [ComboCategory.Flush]: 1,
  [ComboCategory.FullHouse]: 2,
  [ComboCategory.FourCard]: 3,
  [ComboCategory.StraightFlush]: 4,
};

export interface HandEval {
  category: ComboCategory;
  count: number; // 1, 2, 3, 5
  cards: Card[];
  /** 비교에 쓰이는 주요 랭크 (클수록 강함) */
  primaryRank: number;
  /** 동점 시 2차 비교용 (모양 서열 등) */
  secondaryRank: number;
}

function groupByNumber(cards: Card[]): Map<number, Card[]> {
  const map = new Map<number, Card[]>();
  for (const c of cards) {
    const list = map.get(c.number) ?? [];
    list.push(c);
    map.set(c.number, list);
  }
  return map;
}

/**
 * 카드 묶음이 어떤 조합인지 판정한다. 유효하지 않으면 null.
 * (같은 숫자를 가진 카드가 여러 장 섞여 들어와도 올바르게 인식)
 */
export function evaluateCombo(cards: Card[], playerCount: PlayerCount): HandEval | null {
  const { maxNumber } = getRuleSet(playerCount);
  const n = cards.length;

  if (n === 1) {
    const [c] = cards;
    return {
      category: ComboCategory.Single,
      count: 1,
      cards,
      primaryRank: numberStrengthRank(c.number, maxNumber),
      secondaryRank: c.suit,
    };
  }

  if (n === 2) {
    if (cards[0].number !== cards[1].number) return null;
    const bestSuit = Math.max(cards[0].suit, cards[1].suit);
    return {
      category: ComboCategory.Pair,
      count: 2,
      cards,
      primaryRank: numberStrengthRank(cards[0].number, maxNumber),
      secondaryRank: bestSuit,
    };
  }

  if (n === 3) {
    if (cards[0].number !== cards[1].number || cards[1].number !== cards[2].number) return null;
    const bestSuit = Math.max(...cards.map((c) => c.suit));
    return {
      category: ComboCategory.Triple,
      count: 3,
      cards,
      primaryRank: numberStrengthRank(cards[0].number, maxNumber),
      secondaryRank: bestSuit,
    };
  }

  if (n === 5) {
    return evaluateFiveCardCombo(cards, maxNumber);
  }

  return null; // 4장 등은 렉시오에서 유효하지 않은 매수
}

function evaluateFiveCardCombo(cards: Card[], maxNumber: number): HandEval | null {
  const groups = groupByNumber(cards);
  const groupSizes = [...groups.values()].map((g) => g.length).sort((a, b) => b - a);
  const isFlush = cards.every((c) => c.suit === cards[0].suit);
  const numbers = cards.map((c) => c.number);
  const distinctNumbers = new Set(numbers);

  // 스트레이트 계열: 숫자 5개가 모두 달라야 함
  const straightWindowIdx =
    distinctNumbers.size === 5 ? matchStraightWindow(numbers, maxNumber) : null;

  if (straightWindowIdx !== null && isFlush) {
    return {
      category: ComboCategory.StraightFlush,
      count: 5,
      cards,
      primaryRank: buildBigRank(FIVE_CARD_CATEGORY_POWER[ComboCategory.StraightFlush], straightWindowIdx),
      secondaryRank: cards[0].suit, // 동일 스트레이트 구간이면 모양 서열로 2차 비교
    };
  }

  if (groupSizes[0] === 4) {
    // 포카드 (4+1)
    const quadNumber = [...groups.entries()].find(([, g]) => g.length === 4)![0];
    return {
      category: ComboCategory.FourCard,
      count: 5,
      cards,
      primaryRank: buildBigRank(
        FIVE_CARD_CATEGORY_POWER[ComboCategory.FourCard],
        numberStrengthRank(quadNumber, maxNumber)
      ),
      secondaryRank: 0,
    };
  }

  if (groupSizes[0] === 3 && groupSizes[1] === 2) {
    // 풀하우스: 트리플 숫자 높낮이로만 승패 (기본 포커 룰)
    const tripleNumber = [...groups.entries()].find(([, g]) => g.length === 3)![0];
    return {
      category: ComboCategory.FullHouse,
      count: 5,
      cards,
      primaryRank: buildBigRank(
        FIVE_CARD_CATEGORY_POWER[ComboCategory.FullHouse],
        numberStrengthRank(tripleNumber, maxNumber)
      ),
      secondaryRank: 0,
    };
  }

  if (isFlush) {
    // 플러시: 가장 강한 카드(숫자 서열 기준) 순으로 비교
    const sorted = [...cards].sort(
      (a, b) => numberStrengthRank(b.number, maxNumber) - numberStrengthRank(a.number, maxNumber)
    );
    const topRank = numberStrengthRank(sorted[0].number, maxNumber);
    return {
      category: ComboCategory.Flush,
      count: 5,
      cards,
      primaryRank: buildBigRank(FIVE_CARD_CATEGORY_POWER[ComboCategory.Flush], topRank),
      secondaryRank: cards[0].suit,
    };
  }

  if (straightWindowIdx !== null) {
    return {
      category: ComboCategory.Straight,
      count: 5,
      cards,
      primaryRank: buildBigRank(FIVE_CARD_CATEGORY_POWER[ComboCategory.Straight], straightWindowIdx),
      secondaryRank: Math.max(...cards.map((c) => c.suit)),
    };
  }

  return null; // 어떤 5장 조합에도 해당하지 않음
}

/** 카테고리 파워를 상위 비트로, 세부 랭크를 하위 비트로 합쳐 하나의 정렬 가능한 값으로 만든다 */
function buildBigRank(categoryPower: number, detailRank: number): number {
  return categoryPower * 1000 + detailRank;
}

// ---------- 비교 ----------

/**
 * a가 b보다 강하면 양수, 약하면 음수, 같으면 0.
 * count(장수)가 다르면 비교 불가 (규칙: 이전에 나온 조합과 반드시 같은 개수를 내야 함)
 */
export function compareHands(a: HandEval, b: HandEval): number {
  if (a.count !== b.count) {
    throw new Error(`장수가 다른 조합은 비교할 수 없습니다. (${a.count} vs ${b.count})`);
  }
  if (a.primaryRank !== b.primaryRank) return a.primaryRank - b.primaryRank;
  return a.secondaryRank - b.secondaryRank;
}

/** 새로 낸 카드(challenger)가 이전 카드(current)보다 강한지 여부 */
export function canBeat(challenger: HandEval, current: HandEval): boolean {
  if (challenger.count !== current.count) return false;
  return compareHands(challenger, current) > 0;
}
