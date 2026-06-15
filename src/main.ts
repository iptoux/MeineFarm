import "./ui/styles.css";

import { SceneManager } from "./scene/SceneManager";
import { Ground } from "./scene/Ground";
import { createGrass } from "./scene/Grass";
import { SkyManager } from "./scene/Sky";
import { CloudManager } from "./scene/Clouds";
import { RainSystem } from "./scene/Rain";
import { WeatherManager } from "./scene/Weather";
import { AnimalModels } from "./scene/AnimalModels";
import { renderIcon } from "./scene/IconRenderer";
import { CoinBurst } from "./scene/CoinBurst";

import { Game } from "./game/Game";
import { GameSession, type Rig } from "./game/GameSession";

import { DayNightHud } from "./ui/DayNightHud";
import { StartMenu } from "./ui/StartMenu";

import { AudioManager } from "./audio/AudioManager";

/** UI-Elemente, die nur im laufenden Spiel sichtbar sein sollen (nicht im Menü). */
const GAME_UI_IDS = ["hud", "mute-btn", "menu-btn", "daynight", "hint", "build-menu"];

function showGameUi(show: boolean): void {
  for (const id of GAME_UI_IDS) {
    document.getElementById(id)?.classList.toggle("hidden", !show);
  }
}

async function init(): Promise<void> {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;

  // --- Persistentes Rig: bleibt über alle Spielstände hinweg bestehen ---
  const sceneManager = new SceneManager(canvas);
  const ground = new Ground();
  sceneManager.scene.add(ground.mesh);

  // Dynamischer Himmel + Tag/Nacht-Zyklus (steuert die Szenen-Lichter)
  const sky = new SkyManager(
    sceneManager.scene,
    sceneManager.sun,
    sceneManager.hemi,
    sceneManager.ambient,
  );

  // Ziehende Wolken mit weichen Bodenschatten
  const clouds = new CloudManager(sceneManager.scene);

  // Animiertes Wind-Gras (prozeduraler Teppich + GLB-Büschel)
  const grass = await createGrass();
  sceneManager.scene.add(grass.object);

  // Tiermodelle (Poly Pizza) laden und normalisieren
  const models = new AnimalModels();
  await models.load();

  const coinBurst = new CoinBurst(sceneManager.scene);
  const audio = new AudioManager();
  const dayNight = new DayNightHud();

  // Wetter: Regen-Partikel + Wettersteuerung (moduliert Licht/Fog/Wolken)
  const rain = new RainSystem(sceneManager.scene, sceneManager.camera);
  const weather = new WeatherManager({
    scene: sceneManager.scene,
    camera: sceneManager.camera,
    renderer: sceneManager.renderer,
    sky,
    sun: sceneManager.sun,
    hemi: sceneManager.hemi,
    ambient: sceneManager.ambient,
    clouds,
    rain,
    audio,
  });

  // HUD-Geld-Icon aus dem Münzhaufen-Modell rendern
  const pile = models.getCoinPile();
  if (pile) {
    const icon = document.getElementById("money-icon") as HTMLImageElement;
    icon.src = renderIcon(pile, 96);
  }

  const muteBtn = document.getElementById("mute-btn") as HTMLButtonElement;
  muteBtn.addEventListener("click", () => {
    muteBtn.textContent = audio.toggleMute() ? "🔇" : "🔊";
  });

  const rig: Rig = { sceneManager, models, grass, ground, clouds, coinBurst, audio };

  // --- Spiel-Session + Startmenü ---
  let session: GameSession | null = null;

  function exitToMenu(): void {
    session?.dispose();
    session = null;
    showGameUi(false);
    startMenu.open();
  }

  const startMenu = new StartMenu({
    onPlay: (id) => {
      session?.dispose();
      session = new GameSession(rig, id);
      startMenu.close();
      showGameUi(true);
    },
  });

  document.getElementById("menu-btn")?.addEventListener("click", exitToMenu);

  // Beim Start: Game-UI aus, Menü auf
  showGameUi(false);
  startMenu.open();

  // --- Persistente Render-/Update-Schleife ---
  new Game(sceneManager, (dt, tSec) => {
    session?.update(dt, tSec);
    coinBurst.update(dt);
    grass.update(tSec);
    sky.update(dt);
    weather.update(dt, sky.timeOfDay, sky.daylight);
    clouds.update(dt, sky.daylight);
    rain.update(dt);
    dayNight.update(sky.timeOfDay);
    dayNight.setWeather(weather.target);
  }).start();

  // Debug-Hook (nur Dev): erlaubt Inspektion im automatisierten Test
  if (import.meta.env.DEV) {
    (window as unknown as { __game: unknown }).__game = {
      rig,
      sceneManager,
      sky,
      weather,
      grass,
      ground,
      clouds,
      get session() {
        return session;
      },
    };
  }
}

void init();
