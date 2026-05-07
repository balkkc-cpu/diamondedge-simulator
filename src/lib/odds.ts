export function americanToDecimal(american: number): number {
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

export function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

export function impliedProbabilityFromAmerican(american: number): number {
  return american > 0 ? 100 / (american + 100) : Math.abs(american) / (Math.abs(american) + 100);
}

export function expectedValue(hitProb: number, americanOdds: number, stake = 1): number {
  const dec = americanToDecimal(americanOdds);
  const win = (dec - 1) * stake;
  const lose = stake;
  return hitProb * win - (1 - hitProb) * lose;
}

export function breakEvenProbability(americanOdds: number): number {
  return impliedProbabilityFromAmerican(americanOdds);
}

export function kellyFraction(hitProb: number, americanOdds: number): number {
  const b = americanToDecimal(americanOdds) - 1;
  const q = 1 - hitProb;
  const raw = (b * hitProb - q) / b;
  return Math.max(0, raw);
}

export function fractionalKellyUnits(hitProb: number, americanOdds: number, bankrollUnits = 10, fraction = 0.25): number {
  const k = kellyFraction(hitProb, americanOdds) * fraction;
  return Math.min(1.5, Math.round(k * bankrollUnits * 4) / 4);
}

/** True when odds were merged from The Odds API (FanDuel / DraftKings / etc.), not the local seed model. */
export function isSportsbookLineSource(source: string): boolean {
  return source === "fanduel" || source === "draftkings" || source === "betmgm";
}
