# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden in dieser Datei festgehalten.

Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
und das Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

## [Unveröffentlicht]

### Hinzugefügt

- Neues dekoratives Gebäude **Windmühle** (`Windmill.glb`, in Blender im Low-Poly-
  Stil der Scheunen modelliert, gleiche Material-Palette). Bringt erstmals
  **animierte Gebäude** ins Spiel: die Flügel drehen sich dauerhaft (über eine
  sichtbare Windwelle/Achse mit dem Turm verbunden), die Flagge weht, und ein
  **Linksklick öffnet/schließt die Bogen-Doppeltür** (Mixer spielt den
  `DoorOpen`-Clip vor- bzw. rückwärts). Der Turm ist **innen hohl** (Holzboden,
  Getreidesäcke, Mühlstein) und durch die offene Tür einsehbar; die Türöffnung
  ist sauber durch den Sockelring geschnitten. Im oberen Bereich sitzen zwei
  Fachwerk-Fenster, deren Scheiben in der Dämmerung/Nacht warm leuchten
  (`WindowGlow`-Material; `World.update` regelt `emissiveIntensity` anhand von
  `sky.daylight`). Gebäude-Animations-Clips werden jetzt in `AnimalModels` geladen
  und je Gebäude-Instanz über einen eigenen `THREE.AnimationMixer`
  (in `World.update`) abgespielt.

### Geändert

- Hof-Kulisse (`farm-ambience.mp3`) ist jetzt **positional**: sie hängt als eine
  Quelle am Schwerpunkt der Tier-Gebäude und wird mit zunehmender Distanz zur Kamera
  leiser (verstummt zum Karten-Rand hin). Zuvor lief sie global und überall gleich laut.
  Musik, Wetter-Loops und UI-Effekte bleiben global.

## [1.0.0] - 2026-06-16

Erste Version: ein 3D-Bauernhof-Spiel (Three.js) mit Tieren, Feldern, Wetter,
Tag/Nacht-Zyklus, Markt und räumlichem Audio.

### Hinzugefügt

- Kern-Spielwelt: `SlotEntity`- und World-Verwaltung für Tier-Slots und Gebäude.
- Tag/Nacht-Zyklus mit dynamischem Himmel und animiertem Gras.
- Tiere: neue Tier-Definitionen mit Kosten, Einkommen, Intervallen und Boost-Faktoren.
- Critter-Manager mit Hund- und Frosch-Animationen samt Pathfinding für die
  Hund-Bewegung; Hund-Interaktion und zugehörige UI.
- Feld-Mechanik mit Wachstumszyklen und Kürbis-Ernte sowie dynamischer
  Feld-Erweiterung sowie Bestätigungs-Menü.
- Wettersystem mit Audio- und visuellen Effekten, in Spielzustand und Session integriert.
- Markt-System mit Verkaufsdialog und Markt-Menü zum Verkauf von Waren.
- Dynamischer Himmel: Low-Poly-Skybox-Assets und Skybox-Rendering.
- Vögel mit Pick-Verhalten und Teich-Verwaltung; neue Vogel-Modelle.
- Teiche mit Wasser-Rendering inkl. animierter Oberfläche und Wind-Interaktion.
- Teich-Frösche mit eigenständigem Bewegungsverhalten und Über-den-Teich-Sprüngen.
- Räumliches Audiosystem: positionale Ambiente-Sounds für Teiche (Wasser/Frosch)
  und Ställe (Tierrufe).
- Screen-Space-Panning der Kamera mit Begrenzung des Kamera-Ziels.
- Neue Modelle: Marktstände, Kürbisse, Vogelscheuchen und Teiche.

### Geändert

- Wasser-Rendering: Radius, Höhe und Maße der Wasseroberfläche für besseres
  Teich-Rendering angepasst.
- Wetter-Auswahl: Gewichtungen und Änderungswahrscheinlichkeit für mehr
  Abwechslung überarbeitet.
- `Ground` und `SkyManager` für verbesserten Hintergrund und Wolken-Rendering aktualisiert.
- Spieltitel und Hund-Menü-Interaktionen für bessere Bedienung angepasst.

### Behoben

- Gras-Culling berücksichtigt jetzt den Clump-Radius; Build-Margin für das Gras angepasst.
- Position der Coin-Bubble abhängig von der Tiergröße korrigiert.
- Tiergrößen (u. a. Schaf und Pferd) für bessere Skalierung und Balance korrigiert.

### Entfernt

- Obsolete Assets und Sound-Dateien für eine sauberere Projektstruktur entfernt.
- Obsolete Debugging-Skripte entfernt.

[Unveröffentlicht]: https://github.com/iptoux/MeineFarm/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/iptoux/MeineFarm/releases/tag/v1.0.0
