# Gestaltung

Die Anwendung trägt das Hausbild von DELS. Logo und Farben stammen nicht
aus einer Palette, sondern aus der Bilddatei selbst.

## Die Farben

Aus `dels-logo.png` ausgelesen, nicht geschätzt:

| Farbe | Wert | Wo sie vorkommt |
|---|---|---|
| Navy | `#275387` | Seitenleiste, Hauptknöpfe, Rollenschild, Anmeldehintergrund |
| Navy hell | `#2a63aa` | Hover in der Navigation |
| Navy dunkel | `#1d3f68` | aktiver Navigationseintrag, Verläufe |
| Orange | `#ff5a0f` | Markierungsbalken, Fokusrahmen, Balken im Diagramm |
| Orange als Text | `#c2410c` | nur dort, wo Orange Schrift sein muss |

## Die eine Regel, die zählt

**Orange ist keine Schriftfarbe.** Nachgerechnet, nicht nach Gefühl
entschieden:

| Kombination | Kontrast | Urteil |
|---|---|---|
| weiss auf Navy | 7.9 : 1 | AAA |
| Navy auf weiss | 7.9 : 1 | AAA |
| weiss auf Orange | 3.1 : 1 | reicht nicht für Fliesstext |
| Orange auf weiss | 3.1 : 1 | reicht nicht für Fliesstext |
| `#c2410c` auf weiss | 5.2 : 1 | AA |
| `#cbd8e8` auf Navy | 5.4 : 1 | AA, dafür sind inaktive Navigationseinträge da |

Deshalb ist der Hauptknopf navy und nicht orange, obwohl orange
auffälliger wäre. Orange markiert Flächen ohne Text: den Balken am
aktiven Navigationseintrag, den Fokusrahmen, die Balken unter "Stunden
nach Objekt". Wer das vertauscht, baut eine Seite, die auf einem hellen
Bildschirm oder einem älteren Auge nicht mehr lesbar ist.

Nachrechnen lässt sich das mit der Formel aus WCAG 2.1
(relative Leuchtdichte, `(hell + 0.05) / (dunkel + 0.05)`).

## Warum nur die Seitenleiste farbig ist

Der Inhaltsbereich bleibt hell. Das ist kein Versehen: die Hauptansicht
ist eine Tabelle mit 31 Spalten und mehreren hundert Zeilen. Auf
farbigem Grund wird so etwas anstrengend, lange bevor es hässlich wird.
Die Hausfarbe trägt der Rahmen, die Arbeit findet auf Weiss statt.

Die Anmeldeseite ist die Ausnahme: sie zeigt keine Daten, sie wird
Sekunden angeschaut, und sie ist der einzige Bildschirm, den unter
Umständen auch jemand von aussen sieht. Dort steht die Karte auf einem
Navy-Verlauf.

## Logo

`apps/web/src/assets/dels-logo.png`, 172 × 48, mit durchsichtigem Grund.
Die Wortmarke ist einfarbig navy, auf der navyfarbenen Seitenleiste wäre
sie unsichtbar. Deshalb steht sie dort auf einer weissen Fläche mit
abgerundeten Ecken.

Auf dem Handy wird das Logo auf 140 px begrenzt. Ohne das füllte es ein
Drittel des Bildschirms, und die erste Tabellenzeile wäre erst nach dem
Scrollen sichtbar.

Das Favicon liegt unter `apps/web/public/favicon.png`, die Farbe der
Browserleiste auf dem Handy setzt `<meta name="theme-color">`.

## Drucken

Siehe `docs/EXPORT.md`. Kurz: im Druck fallen Navigation und
Bedienelemente weg, das Blatt wird Querformat, und die Kopfzeile der
Tabelle wiederholt sich auf jeder Seite.
