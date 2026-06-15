import "./ui/styles.css";

import { SceneManager } from "./scene/SceneManager";
import { createGround } from "./scene/Ground";
import { createGrass } from "./scene/Grass";
import { SkyManager } from "./scene/Sky";
import { World } from "./scene/World";
import { AnimalModels } from "./scene/AnimalModels";
import { renderIcon } from "./scene/IconRenderer";
import { Picker } from "./scene/Picker";
import { CoinBurst } from "./scene/CoinBurst";
import { PlacementController } from "./scene/PlacementController";
import { RoadController } from "./scene/RoadController";

import { GameState } from "./game/GameState";
import { Game } from "./game/Game";
import { getBuilding } from "./game/config/buildings";
import { getRoad } from "./game/config/roads";

import { Hud } from "./ui/Hud";
import { DayNightHud } from "./ui/DayNightHud";
import { SlotMenu } from "./ui/SlotMenu";
import { BuildMenu } from "./ui/BuildMenu";
import { BuildingMenu } from "./ui/BuildingMenu";
import { AnimalMenu } from "./ui/AnimalMenu";
import { floatMoney } from "./ui/Effects";

import { AudioManager } from "./audio/AudioManager";
import { SaveManager } from "./storage/SaveManager";

async function init(): Promise<void> {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;

  // Szene
  const sceneManager = new SceneManager(canvas);
  sceneManager.scene.add(createGround());

  // Dynamischer Himmel + Tag/Nacht-Zyklus (steuert die Szenen-Lichter)
  const sky = new SkyManager(
    sceneManager.scene,
    sceneManager.sun,
    sceneManager.hemi,
    sceneManager.ambient,
  );

  // Animiertes Wind-Gras (prozeduraler Teppich + GLB-Büschel)
  const grass = await createGrass();
  sceneManager.scene.add(grass.object);

  // Spielzustand + gespeicherten Stand laden (Offline-Gutschrift inklusive)
  const state = new GameState();
  const saveManager = new SaveManager(state);
  saveManager.load();

  // Tiermodelle (Poly Pizza) laden und normalisieren, dann Welt aufbauen
  const models = new AnimalModels();
  await models.load();

  // Welt aus dem Zustand aufbauen (Gebäude + Slot-Entities + Straßen)
  const world = new World(sceneManager.scene, state, models, grass);
  sceneManager.setFadeOnZoom(world.roofMeshes);

  // Effekte & Audio
  const coinBurst = new CoinBurst(sceneManager.scene);
  const audio = new AudioManager();

  // UI
  new Hud(state);
  const dayNight = new DayNightHud();
  const slotMenu = new SlotMenu(state, audio);

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

  // Gebäude-Platzierung (neu bauen + verschieben)
  const placement = new PlacementController(
    sceneManager.scene,
    sceneManager.camera,
    sceneManager.renderer.domElement,
    sceneManager.controls,
    state,
    {
      onBuild: (defId, x, z) => {
        const idx = state.addBuilding(defId, x, z);
        if (idx >= 0) {
          world.addBuildingVisuals(idx);
          audio.playBuild();
        }
      },
      onMove: (i, x, z) => {
        state.moveBuilding(i, x, z);
        world.rebuild();
      },
    },
  );

  // Straßen-Bau
  const roadController = new RoadController(
    sceneManager.scene,
    sceneManager.camera,
    sceneManager.renderer.domElement,
    sceneManager.controls,
    state,
    {
      onChanged: () => world.rebuildRoads(),
      onPlaced: () => audio.playRoad(),
    },
  );

  // Tier-Kontextmenü (Verkaufen)
  const animalMenu = new AnimalMenu(state, {
    onSell: (i) => {
      if (state.sellAnimal(i) > 0) audio.playPurchase();
    },
  });

  // Gebäude-Kontextmenü (Bewegen / Drehen / Entfernen)
  const buildingMenu = new BuildingMenu(state, {
    onMove: (i) => placement.beginMove(i),
    onRotate: (i) => {
      state.rotateBuilding(i);
      world.rebuild();
    },
    onRemove: (i) => {
      if (state.removeBuilding(i)) world.rebuild();
    },
  });

  // Bau-Menü unten: Gebäude → Platzieren, Straße → Straßen-Modus
  new BuildMenu(state, (id) => {
    if (getRoad(id)) {
      roadController.begin(id);
    } else {
      const def = getBuilding(id);
      if (def) placement.begin(def);
    }
  });

  // Klick-Interaktion (während Platzier-/Straßen-Modus blockiert)
  new Picker(
    sceneManager.camera,
    sceneManager.renderer.domElement,
    () => world.pickables(),
    {
      onMarker: (index, screen) => slotMenu.openForSlot(index, screen),
      onBubble: (index, screen) => {
        const gained = state.harvest(index);
        if (gained > 0) {
          audio.playCollect();
          floatMoney(gained, screen.x, screen.y);
          coinBurst.spawn(world.bubbleWorldPos(index));
        }
        slotMenu.close();
      },
      onAnimal: (index, screen) => animalMenu.openForSlot(index, screen),
      onBuilding: (index, screen) => buildingMenu.openForBuilding(index, screen),
    },
    () => placement.active || roadController.active,
  );

  // Speichern + Loop starten
  saveManager.startAutosave();
  new Game(sceneManager, (dt, tSec) => {
    world.update(dt, tSec);
    coinBurst.update(dt);
    grass.update(tSec);
    sky.update(dt);
    dayNight.update(sky.timeOfDay);
  }).start();

  // Debug-Hook (nur Dev): erlaubt Inspektion im automatisierten Test
  if (import.meta.env.DEV) {
    (window as unknown as { __game: unknown }).__game = {
      state,
      world,
      sceneManager,
      placement,
      roadController,
      audio,
      models,
      sky,
      grass,
    };
  }
}

void init();
