/** Coole, typische Hundenamen für den Default-Namen des streunenden Hundes. */
export const DOG_NAMES = [
  "Rex",
  "Bello",
  "Balu",
  "Loki",
  "Nala",
  "Shadow",
  "Mochi",
  "Aki",
  "Kaiser",
  "Suki",
  "Bruno",
  "Luna",
  "Max",
  "Charlie",
  "Rocky",
  "Wuffi",
  "Buddy",
  "Sushi",
  "Thor",
  "Cooper",
] as const;

/** Liefert einen zufälligen coolen Hundenamen. */
export function randomDogName(): string {
  return DOG_NAMES[Math.floor(Math.random() * DOG_NAMES.length)];
}
