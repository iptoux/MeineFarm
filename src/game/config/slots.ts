/** Anzahl der zu Beginn freigeschalteten Slots (im Start-Gebäude). */
export const STARTING_UNLOCKED = 1;

/** Startgeld eines neuen Spiels. */
export const STARTING_MONEY = 15;

/**
 * Kosten, um den n-ten Slot freizuschalten (exponentiell, global gezählt).
 * unlockIndex = wie viele Slots insgesamt bereits freigeschaltet sind.
 * Günstiger Einstieg: 1. Slot = 15, dann x2,2 pro Slot.
 */
export function slotUnlockCost(unlockIndex: number): number {
  const step = unlockIndex - STARTING_UNLOCKED;
  return Math.round(15 * Math.pow(2.2, step));
}
