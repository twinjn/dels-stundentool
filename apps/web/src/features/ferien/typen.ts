/**
 * Was die API unter /api/ferien liefert.
 *
 * Zwei Formen in einer Liste, unterschieden durch "art". TypeScript
 * zwingt einen damit, vor jedem Zugriff zu klären, um welche Gruppe es
 * geht. Genau das ist gewollt: "rest" gibt es im Stundenlohn nicht, und
 * eine Oberfläche, die dort trotzdem eine Null hinschreibt, erfindet
 * eine Aussage.
 */

export type FerienMonatslohn = {
  art: "monat";
  id: string;
  name: string;
  jahr: number;
  anspruch: number;
  anspruchVoll: number;
  anteilig: boolean;
  uebertrag: number;
  uebertragGesetzt: boolean;
  uebertragBemerkung: string | null;
  bezogen: number;
  rest: number;
  verlaufUnvollstaendig: boolean;
};

export type FerienStundenlohn = {
  art: "stunde";
  id: string;
  name: string;
  jahr: number;
  anspruchVoll: number;
  wochen: number;
  zuschlag: number;
  stunden: number;
  /** null heisst: die Rolle darf keine Löhne sehen, oder es ist keiner hinterlegt. */
  basis: number | null;
  entschaedigung: number | null;
  bezogen: number;
};

export type FerienZeile = FerienMonatslohn | FerienStundenlohn;

export type Ferienstand = {
  jahr: number;
  darfLoehne: boolean;
  zeilen: FerienZeile[];
};
