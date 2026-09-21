# Export

Drei Excel-Dateien und ein Weg zum PDF. Alle Exporte laufen über den
Server, nicht im Browser, und jeder hat denselben Wächter wie die
Ansicht, aus der er stammt.

| Was | Adresse | Wer darf | Dateiname |
|---|---|---|---|
| Monatsblatt Stunden | `GET /api/export/stunden?monat=JJJJ-MM` | `stunden:lesen` (admin, büro) | `Stunden_2026-09.xlsx` |
| Kalkulation | `GET /api/export/kalkulation?monat=JJJJ-MM` | `kalkulation:lesen` (nur admin) | `Kalkulation_2026-09.xlsx` |
| Stammdaten | `GET /api/export/stammdaten` | `stammdaten:lesen` (admin, büro) | `Stammdaten_2026-09-21.xlsx` |

## Was in den Dateien steht

**Stunden** – ein Blatt, aufgebaut wie das Monatsblatt am Bildschirm: eine
Zeile je Person mit ihren Abwesenheiten als Kürzel (F, K, U, S, FT),
darunter je eine Zeile pro Objekt mit den Stunden. Rechts die Summen.

**Kalkulation** – vier Blätter: Zusammenfassung, Objekte, Personal,
Adminkosten. Die angewandten Ansätze stehen mit in der Zusammenfassung,
damit ein exportierter Monat auch in einem Jahr noch erklärt, womit er
gerechnet wurde.

**Stammdaten** – zwei Blätter, Mitarbeiter und Objekte.

## Die Regel, auf die es ankommt

Stundenlohn und Monatslohn stehen **nur** in der Datei, wenn die
abrufende Person das Recht `loehne:lesen` hat. Das Büro bekommt dieselbe
Datei mit zwei Spalten weniger, nicht mit leeren Spalten. Geprüft wird
das im Test `export.test.ts`: dort steht unter anderem, dass der Betrag
in **keiner** Zelle der Büro-Datei vorkommt.

Das ist die wichtigste Stelle im ganzen Export. Eine Datei wandert per
Mail weiter, eine Bildschirmansicht bleibt im Programm.

## Jeder Export wird protokolliert

Unter Protokoll (nur admin) steht, wer wann was exportiert hat, bei den
Stammdaten mit dem Vermerk, **ob Löhne mit hinausgegangen sind**. Das ist
die Angabe, nach der im Zweifelsfall gefragt wird.

## PDF

Es gibt bewusst **keinen** PDF-Erzeuger auf dem Server. Der Knopf
"Drucken / PDF" öffnet den Druckdialog des Browsers, dort wählt man "Als
PDF speichern".

Begründung: ein serverseitiges PDF bräuchte entweder eine Kopie von
Chromium im Container (rund 300 MB, plus Sicherheitsupdates) oder eine
PDF-Bibliothek, in der das Layout ein zweites Mal gebaut und gepflegt
werden müsste. Dafür ist der Nutzen zu klein. Der Druckweg liefert immer
genau das, was am Bildschirm steht.

Was es dafür braucht, steht im `@media print`-Block in `styles.css`:
Navigation und Bedienelemente werden ausgeblendet, das Blatt wird
Querformat, und die Tabellenkopfzeile wiederholt sich auf jeder Seite.
Ohne das weiß ab Seite 2 niemand mehr, welche Spalte welcher Tag ist.

Der Nachteil, ehrlich: ein automatischer Monatsversand per Mail geht so
nicht, weil dafür jemand auf einen Knopf drücken muss. Wenn das gebraucht
wird, ist das eine eigene Aufgabe.

## Technische Entscheide

**SheetJS, nicht exceljs.** exceljs stürzt beim Lesen der echten
`.xlsm`-Dateien ab. SheetJS liest sie und schreibt auch, also eine
Bibliothek für beide Richtungen.

**Datumswerte als Seriennummer, selbst gerechnet.** Gibt man SheetJS ein
`Date`-Objekt, rechnet es in Ortszeit um. Auf einem Server westlich von
UTC wird aus dem 1. Februar der 31. Januar. `alsExcelDatum()` rechnet
deshalb selbst, in UTC, und ist das Gegenstück zu `excelDatum()` aus dem
Import. Ein Test schickt fünf Daten durch beide Funktionen.

**.xlsx, nicht .csv.** Ein Name wie `=cmd|...` landet in einer
xlsx-Datei als Text, in einer CSV-Datei als Formel.

**Zahlen sind Zahlen.** Stunden und Beträge stehen als Zahlwerte in den
Zellen, nicht als Text. Sonst kann niemand eine Spalte markieren und
unten die Summe ablesen, und genau dafür exportiert man eine Tabelle.

## Was nicht geht

- **Keine eingefrorenen Kopfzeilen, keine Farben, kein Fettdruck.** Die
  freie Fassung von SheetJS schreibt keine Zellformate. Geprüft, nicht
  vermutet: ein gesetztes `ws["!freeze"]` taucht in der erzeugten Datei
  nicht auf. Spaltenbreiten und Zahlenformate gehen, der Rest nicht
- **Keine Lohnabrechnung.** Die war in Phase 7 mitgedacht, braucht aber
  Entscheide, die noch nicht gefallen sind (Quellensteuer, Abzüge je
  Person, Layout des Belegs)
- **Kein Export über mehrere Monate.** Ein Aufruf, ein Monat. Ein
  Jahresblatt wäre möglich, war aber nicht verlangt
