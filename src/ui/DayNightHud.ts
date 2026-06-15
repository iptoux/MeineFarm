/**
 * Zeigt die aktuelle Tageszeit oben mittig: Phasen-Icon, Uhrzeit (HH:MM) und
 * einen Farbverlaufs-Balken mit Marker. Gespeist aus `SkyManager.timeOfDay`
 * (0 = Mitternacht, 0.25 = Sonnenaufgang, 0.5 = Mittag, 0.75 = Sonnenuntergang).
 */
export class DayNightHud {
  private icon = document.getElementById("dn-icon")!;
  private time = document.getElementById("dn-time")!;
  private marker = document.getElementById("dn-marker")!;
  private lastMinute = -1;

  /** Im Render-Loop mit der Tageszeit [0,1) aufrufen. */
  update(timeOfDay: number): void {
    const totalMin = Math.floor(timeOfDay * 24 * 60);
    if (totalMin === this.lastMinute) return; // nur bei Minutenwechsel neu zeichnen
    this.lastMinute = totalMin;

    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    this.time.textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    this.icon.textContent = phaseIcon(timeOfDay);
    this.marker.style.left = `${timeOfDay * 100}%`;
  }
}

/** Emoji passend zur Tagesphase. */
function phaseIcon(t: number): string {
  if (t >= 0.23 && t < 0.3) return "🌅"; // Sonnenaufgang
  if (t >= 0.3 && t < 0.7) return "☀️"; // Tag
  if (t >= 0.7 && t < 0.77) return "🌇"; // Sonnenuntergang
  return "🌙"; // Nacht
}
