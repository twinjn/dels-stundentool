# Das Format der bestehenden Excel-Stundenkontrolle

Notizen aus der Analyse von `Stundenkontrolle_Verwaltung_2026_Mitarbeiter.xlsm`.
Grundlage für den Import in `apps/api/src/import/excel.ts`.

## Aufbau der Datei

19 Blätter, rund 310 KB VBA-Makrocode, Ablage auf SharePoint.

| Blatt | Inhalt |
|---|---|
| `Januar` … `Dezember` | ein Monatsblatt je Monat, 1659 Zeilen × 68 Spalten |
| `Übersicht` | Jahresübersicht je Person und Monat |
| `Objekte` | Objektstamm, je Objekt eine eigene Datei (`10002_2026.xlsm`) |
| `PER_Stamm` | Personalstamm |
| `Daten` | Schlüssel, Kürzel, Listen |
| `Support`, `Dashboard`, `Office` | Hilfsblätter |

## Aufbau eines Monatsblatts

```
Zeile 3:  C = Jahr                 D = erster Tag des Monats
Zeile 4:  ab Spalte I die Wochentage
Zeile 5:  A=ZCode B=Z C=PerNr. D=Name/Objekt E=Obj.Nr. F=Pos. G=KA
          ab Spalte I die 31 Tagesspalten
          AN=Arbeit AO=Ferien AP=Krank AQ=Unfall AR=Sonst AS=Spesen
Zeile 6+: Blöcke je Person, 11 Zeilen pro Block
          ZCode 1 = Summenzeile der Person (Name in D)
          ZCode 2 = eine Zeile je Objekt (Obj.Nr. in E), bis zu 10 Stück
```

Eine Tageszelle enthält entweder eine Stundenzahl oder ein Kürzel.

## Die Kürzel

| Kürzel | Bedeutung | Gehört zu | Zählt Excel in |
|---|---|---|---|
| `F`, `f` | Ferien | Person | Spalte Ferien |
| `K` | Krank | Person | Spalte Krank |
| `U` | Unfall | Person | Spalte Unfall |
| `S` | Sonstiges | Person | Spalte Sonst |
| `Fr`, `FF` | Frei | **Objekt** | **keine Summe** |

Die Legende im Blatt `Daten` nennt `FF` für Frei, in den Daten steht durchwegs
`Fr`. Beides wird akzeptiert.

## Drei Fallen

**1. Abwesenheiten stehen auf jeder Objektzeile.** Wer zwei Objekte hat, hat
dasselbe `F` zweimal dastehen. Gemeint ist ein Tag. Ohne Entdopplung
verdoppelt sich der Ferienanspruch.

**2. `Fr` ist etwas anderes als `F`.** Es steht an verschiedenen Tagen auf
verschiedenen Objektzeilen derselben Person und zählt in keine Summenspalte.
Es gehört zum Objekt, nicht zur Person.

**3. Das Raster ist immer 31 Spalten breit.** Im Februar gehören die letzten
drei Spalten schon zum März. Die Tagesdaten werden deshalb aus dem Monat
berechnet, nicht aus den Spaltenköpfen gelesen. Das umgeht zugleich alle
Zeitzonenprobleme beim Lesen von Excel-Datumswerten.

## Gefundener Datenfehler

Excel teilt jede Abwesenheitsmarkierung durch die Anzahl Objektzeilen, um
doppeltes Zählen zu vermeiden. Fehlt eine Markierung auf einer Zeile, ergibt
das einen **Bruchteil eines Tages**, ohne Hinweis.

Im Jahrgang 2026 gibt es genau einen solchen Fall: März, PersNr 1123, Excel
zeigt 22.5 Ferientage. Tatsächlich waren es 23, auf einer der beiden
Objektzeilen fehlt ein `F`.

Der Import zählt den ganzen Tag und meldet die Stelle, statt sie zu
verstecken.

## Stand der Prüfung

Gegen die echte Datei, alle zwölf Monate 2026:

| | |
|---|---|
| gelesene Einträge | 3773 |
| Warnungen | 1 (der Fall oben) |
| Abweichungen zu den Excel-Summen | 1 (derselbe Fall) |
| Lesedauer der 12-MB-Datei | rund 5 Sekunden |

Alle übrigen Summen stimmen exakt mit denen überein, die Excel rechts
anzeigt.

---

# Die Objektdateien (`10002_2026.xlsm` … `10053_2026.xlsm`)

Neben der Verwaltungsdatei gibt es eine Datei je Objekt und Jahr. Der
Nummernbereich steht im Blatt `Daten` der Vorlage: **10002 bis 10053**,
also rund 52 Objekte.

Sie sind **genau andersherum** aufgebaut als die Verwaltungsdatei: dort
steht eine Person mit ihren Objekten darunter, hier ein Objekt mit seinen
Personen darunter.

```
Zeile 2:  A = Jahr   B = erster Tag des Monats   G = Objektnummer
Zeile 3:  ab Spalte D die Wochentage
Zeile 4:  A=PersNr. B=Name C=KA
          ab Spalte D die 31 Tagesspalten
          AI=Arbeit AJ=Ferien AK=Krank AL=Unfall AM=Sonst AN=Saldo AO=Bemerkungen
Zeile 5+: je eine Person (19 Plätze), bis zur Zeile "Monatstotal"
Zeile 25: Visum Objektleiter
```

Zusätzlich enthalten diese Dateien:

| Blatt | Inhalt |
|---|---|
| `Personal` | vollständiger Personalstamm: PersNr, Status, Anrede, Name, Vorname, **Funktion**, Einsatzort, Austrittsdatum, **Ferienanspruch**, **Ferien-Saldo** |
| `Objekte` | Objektstamm |
| `Übersicht` | Jahreszahlen je Person |

Die Funktionen aus dem Personalstamm: Manager, Aussendienst, Teamleiter,
Büro, Hauswart, UHR I, UHR II, UHR III, Temporär.

## Die Falle bei mehreren Dateien

Wer auf fünf Objekten arbeitet, hat seine **Ferien in fünf Objektdateien**
stehen. Ohne Entdopplung werden daraus fünf Ferientage.

Deshalb entdoppelt nicht der einzelne Dateileser, sondern
`zusammenfuehren()` über alle Dateien hinweg, und zwar nur die
Abwesenheiten der Person. Gearbeitete Stunden bleiben alle erhalten, die
gehören ja zu verschiedenen Objekten.

## Stand der Prüfung

Zwei echte Objektdateien lagen zum Prüfen vor (10001 und 10019). **Beide
sind vollständig leer**: keine Person zugeordnet, null erfasste Zellen in
allen zwölf Monaten. Der Leser kommt damit sauber zurecht (liest die
Objektnummer richtig, meldet nichts), aber gegen **echte Zahlen** ist er
noch nicht geprüft.

Das ist weniger schlimm, als es klingt: der Import rechnet die Summen nach
und vergleicht sie mit den Spalten AI bis AM, die Excel selbst füllt.
Stimmt etwas nicht, meldet der Trockenlauf es sofort. Man muss dem Leser
also nicht glauben, er prüft sich selbst.
