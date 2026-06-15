/**
 * Zeigt oben mittig: Wetter-Icon, Uhrzeit (HH:MM) und einen Farbverlaufs-Balken
 * mit Marker. Gespeist aus `SkyManager.timeOfDay` (0 = Mitternacht, 0.25 =
 * Sonnenaufgang, 0.5 = Mittag, 0.75 = Sonnenuntergang) und dem WeatherManager.
 */
import type { WeatherKind } from "../scene/Weather";

export class DayNightHud {
  private weather = document.getElementById("dn-weather")!;
  private time = document.getElementById("dn-time")!;
  private marker = document.getElementById("dn-marker")!;
  private lastMinute = -1;
  private lastWeather: WeatherKind | null = null;

  /** Im Render-Loop mit der Tageszeit [0,1) aufrufen. */
  update(timeOfDay: number): void {
    const totalMin = Math.floor(timeOfDay * 24 * 60);
    if (totalMin === this.lastMinute) return; // nur bei Minutenwechsel neu zeichnen
    this.lastMinute = totalMin;

    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    this.time.textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    this.marker.style.left = `${timeOfDay * 100}%`;
  }

  /** Setzt das Wetter-Icon (nur bei Änderung neu zeichnen). */
  setWeather(kind: WeatherKind): void {
    if (kind === this.lastWeather) return;
    this.lastWeather = kind;
    this.weather.textContent = weatherIcon(kind);
  }
}

/** Emoji passend zur Wetterlage. */
function weatherIcon(kind: WeatherKind): string {
  switch (kind) {
    case "rain":
      return "🌧️";
    case "storm":
      return "⛈️";
    case "fog":
      return "🌫️";
    default:
      return "☀️";
  }
}
