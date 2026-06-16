import type { SceneManager } from "../scene/SceneManager";
import type { AnimalModels } from "../scene/AnimalModels";
import type { Grass } from "../scene/Grass";
import type { Ground } from "../scene/Ground";
import type { CloudManager } from "../scene/Clouds";
import { CoinBurst } from "../scene/CoinBurst";
import { World } from "../scene/World";
import { Picker } from "../scene/Picker";
import { PlacementController } from "../scene/PlacementController";
import { RoadController } from "../scene/RoadController";
import { FieldExpansion } from "../scene/FieldExpansion";
import { CritterManager } from "../scene/Critters";

import { GameState } from "./GameState";
import { getBuilding } from "./config/buildings";
import { getRoad } from "./config/roads";

import { Hud } from "../ui/Hud";
import { SlotMenu } from "../ui/SlotMenu";
import { BuildMenu } from "../ui/BuildMenu";
import { BuildingMenu } from "../ui/BuildingMenu";
import { AnimalMenu } from "../ui/AnimalMenu";
import { FieldMenu } from "../ui/FieldMenu";
import { floatMoney } from "../ui/Effects";

import { AudioManager } from "../audio/AudioManager";
import { AmbientAnimals } from "../audio/AmbientAnimals";
import { SaveManager } from "../storage/SaveManager";

/** Persistente Infrastruktur, die über alle Spielstände hinweg bestehen bleibt. */
export interface Rig {
  sceneManager: SceneManager;
  models: AnimalModels;
  grass: Grass;
  ground: Ground;
  clouds: CloudManager;
  coinBurst: CoinBurst;
  audio: AudioManager;
}

/**
 * Ein laufendes Spiel für genau einen Spielstand. Besitzt den `GameState`, die
 * sichtbare `World` und alle an den State gebundenen UI-/Controller-Objekte.
 * Die teure Infrastruktur (Szene, Modelle, Gras, Loop) kommt vom übergebenen
 * `Rig` und überlebt `dispose()`. Globale Listener (Picker, Kontextmenüs) hängen
 * an einem `AbortController` und werden beim Abbau automatisch abgemeldet.
 */
export class GameSession {
  readonly state = new GameState();
  private world: World;
  private slotMenu: SlotMenu;
  private animalMenu: AnimalMenu;
  private buildingMenu: BuildingMenu;
  private placement: PlacementController;
  private roadController: RoadController;
  private fieldExpansion: FieldExpansion;
  private fieldMenu: FieldMenu;
  private ambient: AmbientAnimals;
  private critters: CritterManager;
  private abort = new AbortController();
  private stopAutosave: () => void;

  constructor(
    private rig: Rig,
    private saveId: string,
  ) {
    const { sceneManager, models, grass, coinBurst, audio } = rig;
    const signal = this.abort.signal;

    SaveManager.loadInto(this.state, saveId);

    // Welt aus dem Zustand aufbauen (Gebäude + Slot-Entities + Straßen)
    this.world = new World(sceneManager.scene, this.state, models, grass);
    sceneManager.setFadeOnZoom(this.world.roofMeshes);

    // HUD
    new Hud(this.state);
    this.slotMenu = new SlotMenu(this.state, audio, signal);

    // Gebäude-Platzierung (neu bauen + verschieben)
    this.placement = new PlacementController(
      sceneManager.scene,
      sceneManager.camera,
      sceneManager.renderer.domElement,
      sceneManager.controls,
      this.state,
      {
        onBuild: (defId, x, z, rotation) => {
          const idx = this.state.addBuilding(defId, x, z, rotation);
          if (idx >= 0) {
            this.world.addBuildingVisuals(idx);
            audio.playBuild();
          }
        },
        onMove: (i, x, z, rotation) => {
          this.state.moveBuilding(i, x, z, rotation);
          this.world.rebuild();
        },
      },
    );

    // Straßen-Bau
    this.roadController = new RoadController(
      sceneManager.scene,
      sceneManager.camera,
      sceneManager.renderer.domElement,
      sceneManager.controls,
      this.state,
      {
        onChanged: () => this.world.rebuildRoads(),
        onPlaced: () => audio.playRoad(),
      },
    );

    // Spielfeld-Erweiterung („+"-Pads an den Kanten) + Bestätigungs-Popup
    this.fieldMenu = new FieldMenu(
      this.state,
      {
        onConfirm: (edge) => {
          if (this.state.expandField(edge)) {
            this.applyField();
            audio.playPurchase();
          }
        },
      },
      signal,
    );
    this.fieldExpansion = new FieldExpansion(
      sceneManager.scene,
      sceneManager.camera,
      sceneManager.renderer.domElement,
      this.state,
      { onRequestExpand: (edge, screen) => this.fieldMenu.openForEdge(edge, screen) },
      () => this.placement.active || this.roadController.active,
      signal,
    );

    // Tier-Kontextmenü (Verkaufen)
    this.animalMenu = new AnimalMenu(
      this.state,
      {
        onSell: (i) => {
          if (this.state.sellAnimal(i) > 0) audio.playPurchase();
        },
      },
      signal,
    );

    // Gebäude-Kontextmenü (Bewegen / Drehen / Entfernen)
    this.buildingMenu = new BuildingMenu(
      this.state,
      {
        onMove: (i) => this.placement.beginMove(i),
        onRotate: (i) => {
          this.state.rotateBuilding(i);
          this.world.rebuild();
        },
        onRemove: (i) => {
          if (this.state.removeBuilding(i)) this.world.rebuild();
        },
      },
      signal,
    );

    // Bau-Menü unten: Gebäude → Platzieren, Straße → Straßen-Modus
    new BuildMenu(this.state, (id) => {
      if (getRoad(id)) {
        this.roadController.begin(id);
      } else {
        const def = getBuilding(id);
        if (def) this.placement.begin(def);
      }
    });

    // Klick-Interaktion (während Platzier-/Straßen-Modus blockiert)
    new Picker(
      sceneManager.camera,
      sceneManager.renderer.domElement,
      () => this.world.pickables(),
      {
        onMarker: (index, screen) => this.slotMenu.openForSlot(index, screen),
        onBubble: (index, screen) => {
          const gained = this.state.harvest(index);
          if (gained > 0) {
            audio.playCollect();
            floatMoney(gained, screen.x, screen.y);
            coinBurst.spawn(this.world.bubbleWorldPos(index));
          }
          this.slotMenu.close();
        },
        onAnimal: (index, screen) => {
          const id = this.state.slots[index]?.animalId;
          if (id) audio.playAnimalCall(id, 0.55);
          this.animalMenu.openForSlot(index, screen);
        },
        onBuilding: (index, screen) => this.buildingMenu.openForBuilding(index, screen),
      },
      () => this.placement.active || this.roadController.active,
      signal,
    );

    this.ambient = new AmbientAnimals(this.state, audio);
    this.critters = new CritterManager(sceneManager.scene, this.state, models);

    this.stopAutosave = SaveManager.startAutosave(this.state, saveId);

    // Boden/Gras/Wolken/Kamera an das geladene Spielfeld anpassen.
    this.applyField();
  }

  /** Synchronisiert alle feldabhängigen Systeme mit `state.field` (nach Laden/Erweitern). */
  private applyField(): void {
    const f = this.state.field;
    this.rig.ground.resize(f);
    this.rig.grass.rebuildForField(f);
    this.world.cullGrass(); // Belegung nach Gras-Rebuild neu anwenden
    this.rig.clouds.setBounds(f);
    this.fieldExpansion.reposition(f);
    this.rig.sceneManager.setPanBounds(f);
  }

  /** Wird pro Frame von der Rig-Schleife aufgerufen (Produktion + Erntefortschritt). */
  update(dt: number, tSec: number): void {
    this.world.update(dt, tSec);
    this.ambient.update(dt);
    this.critters.update(dt);
  }

  /** Baut das Spiel sauber ab: speichert, hängt Listener ab, räumt die Szene auf. */
  dispose(): void {
    this.placement.cancel();
    this.roadController.cancel();
    this.fieldExpansion.dispose();
    this.fieldMenu.close();
    this.stopAutosave();
    SaveManager.save(this.state, this.saveId);
    this.slotMenu.close();
    this.animalMenu.close();
    this.buildingMenu.close();
    this.abort.abort();
    this.critters.dispose();
    this.world.dispose();
  }
}
