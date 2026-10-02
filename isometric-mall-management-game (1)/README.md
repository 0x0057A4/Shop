# Mallside

Eine deutschsprachige, lokal spielbare isometrische Einkaufszentrum-Simulation mit React, Vite und Tailwind CSS v4. Der Einstieg erfolgt mit genau einem frei auswählbaren Startladen und 12.480 Euro Startkapital.

## Läden

- **TCG-Laden:** Booster herstellen und öffnen, fünf illustrierte Karten pro Pack, garantierte seltene Karte, vier Seltenheitsstufen, Sammlung, direkter Verkauf und automatischer Einzelkartenverkauf. Weitere Rezepte: Kartenhüllen, Grading-Karten und Turnierdecks.
- **IT-Komponenten:** RAM-Kits, Mainboards, Gaming-PCs und wiederaufbereitete Laptops herstellen. Reparaturaufträge verbrauchen Ersatzteile, belegen Arbeitsplätze und belohnen erfolgreiche Reparaturen mit Umsatz und Beliebtheit.
- **Bäckerei:** Grundteig als Vorprodukt herstellen und zu Croissants verarbeiten. Weitere Rezepte: Landbrot und Beerentörtchen. Backwaren werden über Nacht zu 25 Prozent aussortiert.

## Spielsysteme

- Jeder Laden hat eigene Rohstoffe, Verkaufsartikel, Produktion, Einrichtung, Mitarbeiter, Preise und Finanzen.
- Kassen verbessern den Kundendurchsatz. Regale schaffen je 40 Lagerplätze. Dekoration erhöht die Beliebtheit. Arbeitsplätze und Personal ermöglichen bis zu drei parallele Aufträge.
- Eine Produktionswarteschlange fasst sechs Aufträge mit jeweils ein bis drei Chargen. Aufträge können mit vollständiger Rückgabe ihrer Rohstoffe abgebrochen werden.
- Rezepte können automatisch nachproduzieren. Das System wartet bei fehlenden Rohstoffen oder fehlendem Lagerplatz und reserviert Platz für laufende Aufträge.
- Die Simulation läuft beim Navigieren weiter. Beim Wiederöffnen wird höchstens fünf Minuten reale Abwesenheit nachgeholt. Pausierte Spielstände bleiben pausiert.
- Die isometrische Ladenansicht enthält anklickbare Kassen, Regale und Arbeitsplätze. Einrichtung, Mitarbeiter und leere Verkaufsregale verändern die Darstellung.
- Die Auslagen zeigen konkrete Artikel statt generischer Platzhalter: Nova-Booster, Einzelkarten, Decks, RAM-Module, PCs, Laptops, Brot, Croissants, Törtchen und die tatsächlichen Rohstoffe. Karten erscheinen nur, wenn sie zum Verkauf gelistet sind.
- Jede sichtbare Verkaufseinheit wird vom echten Lagerbestand abgezogen. Wenn ein Artikel verkauft oder hergestellt wird, aktualisiert sich die Szene. Die Zahl der dargestellten Regale entspricht genau den gekauften Regalen. Laufende Aufträge erscheinen separat als **in Arbeit** und werden nicht als fertige Lagerware gezählt.
- Kunden betreten den Laden durch die Tür, laufen zwischen den Möbeln hindurch, bleiben vor Regalen stehen und verlassen den Laden wieder. Sie folgen dabei den freien Kacheln, weichen Hindernissen aus und passen sich an, wenn du Möbel verschiebst. Ihre Zahl wächst mit der Beliebtheit.
- Klicke eine Ware in der Szene oder nutze **Waren**, um ihren exakten Gesamtbestand, den sichtbaren Bestand und den aktuellen Preis zu sehen. Über den Einblick gelangst du zur passenden Lager-, Sammlungs- oder Produktionsansicht.
- Der Ladenboden besteht aus 9 × 7 Kacheln. Kasse, Auslage, Mittelvitrine, Rohstoffregal, Regale, Arbeitsplätze und Deko lassen sich frei auf diesen Kacheln verschieben und drehen. Die Anordnung wird mitgespeichert; belegte Flächen, Wände und der Eingang bleiben gesperrt.
- Zusätzliche Läden können gekauft und in einer gemeinsamen Mall-Ansicht besucht werden.
- Tageswechsel, Miete, Mitarbeiterlöhne, Umsatzdiagramm, einstellbare Verkaufspreise, Mitarbeitertraining und belohnte Einstiegsaufgaben.

## Bedienung

1. Startladen wählen und auf **Lass uns loslegen** klicken.
2. Ladenobjekte anklicken oder die seitliche Navigation benutzen.
3. Im Bereich **Produktion** Rezepte starten oder automatische Nachproduktion aktivieren.
4. Im **Lager & Einkauf** Rohstoffe bestellen, Preise ändern und Artikel verkaufen.
5. Über **Meine Läden** weitere Geschäfte eröffnen.
6. Auf **Anordnen** in der Ladenansicht (oder **Im Laden anordnen** unter **Einrichtung**) wechselst du in den Einrichtungsmodus. Ziehe Möbel mit der Maus oder den Fingern auf eine freie Kachel. Mit den **Pfeiltasten** verschiebst du das gewählte Möbelstück Kachel für Kachel, mit **R** drehst du es. Grüne Felder sind frei, rote Felder belegt.

**Leertaste** pausiert die Simulation, **1 / 2 / 3** ändern das Tempo und **Esc** schliesst Dialoge. Kamera-Zoom, Zurücksetzen und Vollbild sind direkt in der Spielwelt erreichbar.

## Spielstand

Automatische Speicherung im Browserspeicher unter `mallside-save-v1`. Auch die Möbelanordnung wird gespeichert; ältere Spielstände erhalten automatisch eine gültige Standardanordnung. In den Einstellungen kann der Spielstand als JSON exportiert und auf einem anderen Gerät importiert werden. Importierte Dateien werden vor dem Laden validiert. Es gibt kein Backend und keine Anmeldung. Dein Spielstand wird nicht an einen Server gesendet.

## Struktur

- `src/App.tsx`: Einstieg, Navigation, Dialoge, Speicherung und Simulationstakt.
- `src/game/data.ts`: Ladentypen, Materialien, Rezepte und Einrichtungsdefinitionen.
- `src/game/layout.ts`: Kachel-Raster, Grundflächen, Kollisionen, Pfadsuche für Kunden.
- `src/game/engine.ts`: Produktion, Handel, Reparaturen, Erweiterung, Möbelverschieben und Spielstand-Validierung.
- `src/components/IsoScene.tsx`: interaktive isometrische SVG-Spielwelt inklusive Kachel-Editor.
- `src/components/ShopPieces.tsx`: Kassen, Regale, Auslagen, Arbeitsplätze und Deko auf Kacheln.
- `src/components/Customers.tsx`: laufende Kunden mit Pfaden über die freien Kacheln.
- `src/components/Cards.tsx`: Kartenillustrationen und animiertes Pack-Opening.
- `src/components/ManagementViews.tsx`: Herstellung, Inventar, Einrichtung, Personal, Finanzen und Aufgaben.
- `src/index.css`: responsives Design und reduzierte Bewegungen bei entsprechender Systemeinstellung.

Schriften, Kartenillustrationen und Spielgrafik sind lokal eingebunden. Spielton ist standardmässig deaktiviert und kann in den Einstellungen eingeschaltet werden.