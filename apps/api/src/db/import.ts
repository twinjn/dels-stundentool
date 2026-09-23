/**
 * Uebernimmt die Daten aus dem Altsystem (Supabase) in die eigene Datenbank.
 *
 * Grundsaetze:
 *  - Die Daten fliessen direkt von Datenbank zu Datenbank. Sie landen weder
 *    in einer Datei im Repository noch in einem Chatverlauf. Personendaten
 *    sollen sich moeglichst wenig verteilen.
 *  - Die IDs bleiben erhalten. Dadurch bleiben alle Verknuepfungen heil und
 *    der Import laesst sich wiederholen.
 *  - Alles laeuft in EINER Transaktion. Entweder ist am Ende alles da oder
 *    gar nichts. Ein halb importierter Datenbestand waere schlimmer als
 *    keiner.
 *
 * Die Tabellen heissen in Version 2 teilweise anders. Die Zuordnung:
 *
 *   employees          -> mitarbeiter     (created_at -> erstellt_am)
 *   objekte            -> objekte
 *   entries            -> eintraege       (employee_id -> mitarbeiter_id,
 *                                          type -> art, value -> wert,
 *                                          date -> datum, note -> notiz)
 *   kalk_monat         -> kalk_monat
 *   kalk_adminkosten   -> kalk_adminkosten
 *   kalk_objekt_monat  -> kalk_objekt_monat
 *   kalk_person_monat  -> kalk_person_monat (employee_id -> mitarbeiter_id)
 */
import type { Pool } from "pg";

export type ImportBericht = Record<string, number>;

/** Reihenfolge zaehlt: erst die Tabellen, auf die andere verweisen. */
const REIHENFOLGE = [
  "mitarbeiter",
  "objekte",
  "kalk_monat",
  "eintraege",
  "kalk_adminkosten",
  "kalk_objekt_monat",
  "kalk_person_monat",
] as const;

type Zieltabelle = (typeof REIHENFOLGE)[number];

/**
 * Pro Zieltabelle: woher die Daten kommen und wie die Spalten heissen.
 * Links steht die Zielspalte, rechts der Ausdruck in der Quelle.
 */
const ZUORDNUNG: Record<Zieltabelle, { quelle: string; spalten: Record<string, string> }> = {
  mitarbeiter: {
    quelle: "employees",
    spalten: {
      id: "id",
      name: "name",
      personalnummer: "personalnummer",
      mitarbeiterstufe: "mitarbeiterstufe",
      eintrittsdatum: "eintrittsdatum",
      ferienanspruch: "ferienanspruch",
      soll_pro_tag: "soll_pro_tag",
      stundenlohn: "stundenlohn",
      monatslohn: "monatslohn",
      telefon: "telefon",
      email: "email",
      strasse: "strasse",
      plz: "plz",
      ort: "ort",
      geburtsdatum: "geburtsdatum",
      ahv_nummer: "ahv_nummer",
      iban: "iban",
      erstellt_am: "created_at",
    },
  },
  objekte: {
    quelle: "objekte",
    spalten: {
      id: "id",
      name: "name",
      objekt_nr: "objekt_nr",
      kunde: "kunde",
      strasse: "strasse",
      plz: "plz",
      ort: "ort",
      abo_betrag: "abo_betrag",
      aktiv: "aktiv",
      notizen: "notizen",
      erstellt_am: "created_at",
    },
  },
  kalk_monat: {
    quelle: "kalk_monat",
    spalten: {
      monat: "monat",
      ahv: "ahv",
      alv: "alv",
      nbu: "nbu",
      bu: "bu",
      ktg_objekt: "ktg_objekt",
      ktg_personal: "ktg_personal",
      rpk: "rpk",
      fak: "fak",
      ml13: "ml13",
      nbu_schwelle: "nbu_schwelle",
      nbu_traegt_ag: "nbu_traegt_ag",
      bvg_satz: "bvg_satz",
      bvg_eintritt: "bvg_eintritt",
      bvg_koord: "bvg_koord",
      bvg_min: "bvg_min",
      bvg_max: "bvg_max",
      mat: "mat",
      mas: "mas",
      trs: "trs",
      trs_topf: "trs_topf",
      trs_schluessel: "trs_schluessel",
      admin_reserve: "admin_reserve",
      notiz: "notiz",
      erstellt_am: "created_at",
    },
  },
  eintraege: {
    quelle: "entries",
    spalten: {
      id: "id",
      mitarbeiter_id: "employee_id",
      objekt_id: "objekt_id",
      datum: "date",
      art: "type",
      wert: "value",
      notiz: "note",
      erstellt_am: "created_at",
    },
  },
  kalk_adminkosten: {
    quelle: "kalk_adminkosten",
    spalten: {
      id: "id",
      monat: "monat",
      position: "position",
      betrag: "betrag",
      sortierung: "sortierung",
    },
  },
  kalk_objekt_monat: {
    quelle: "kalk_objekt_monat",
    spalten: {
      monat: "monat",
      objekt_id: "objekt_id",
      abo_betrag: "abo_betrag",
      std_manuell: "std_manuell",
      lohn_manuell: "lohn_manuell",
      ma: "ma",
      aktiv: "aktiv",
    },
  },
  kalk_person_monat: {
    quelle: "kalk_person_monat",
    spalten: {
      monat: "monat",
      mitarbeiter_id: "employee_id",
      lohn: "lohn",
      spesen: "spesen",
      ml13: "ml13",
      abzug_ahv: "abzug_ahv",
      abzug_alv: "abzug_alv",
      abzug_rpk: "abzug_rpk",
      abzug_fak: "abzug_fak",
      fak_manuell: "fak_manuell",
      bvg: "bvg",
      bvg_manuell: "bvg_manuell",
    },
  },
};

function alsBezeichner(name: string): string {
  // Wir setzen Tabellen- und Spaltennamen selbst zusammen, sie kommen aus
  // den Tabellen oben und nie von aussen. Trotzdem pruefen wir sie, damit
  // ein Tippfehler nicht als SQL interpretiert werden kann.
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Unzulaessiger Bezeichner: ${name}`);
  }
  return `"${name}"`;
}

/**
 * Die Tabellen, die --leeren wegraeumt, in EINER truncate-Anweisung.
 *
 * ferien_uebertrag steht mit drin, obwohl der Import sie nie fuellt:
 * Postgres verweigert ein truncate auf eine Tabelle, auf die ein
 * Fremdschluessel zeigt, unabhaengig davon, ob dort Zeilen stehen.
 *
 * Bewusst kein CASCADE. Das wuerde jede kuenftige Tabelle stillschweigend
 * mitleeren, auch eine, die jemand gerade erst angelegt hat und die
 * wertvolle Daten haelt. Lieber bricht der Import ab und jemand schaut
 * hin. Damit das nicht erst im Ernstfall auffaellt, gibt es dazu einen
 * Test, der die Anweisung wirklich ausfuehrt und zurueckrollt.
 *
 * NICHT geleert werden benutzer, sitzungen und protokoll: Konten und
 * Spuren ueberleben einen erneuten Import.
 */
export const ZU_LEEREN = [
  "eintraege",
  "ferien_uebertrag",
  "kalk_person_monat",
  "kalk_objekt_monat",
  "kalk_adminkosten",
  "kalk_monat",
  "objekte",
  "mitarbeiter",
] as const;

/** Zaehlt, was in der Zieldatenbank schon vorhanden ist. */
export async function zielBestand(ziel: Pool): Promise<ImportBericht> {
  const bericht: ImportBericht = {};
  for (const tabelle of REIHENFOLGE) {
    const { rows } = await ziel.query<{ anzahl: string }>(
      `select count(*)::text as anzahl from ${alsBezeichner(tabelle)}`,
    );
    bericht[tabelle] = Number(rows[0]?.anzahl ?? 0);
  }
  return bericht;
}

/**
 * Kopiert alle Tabellen. quellSchema ist normalerweise "public"; fuer Tests
 * laesst sich damit eine Attrappe in einem anderen Schema ansprechen.
 */
export async function importiere(
  quelle: Pool,
  ziel: Pool,
  optionen: { quellSchema?: string } = {},
): Promise<ImportBericht> {
  const quellSchema = optionen.quellSchema ?? "public";
  const bericht: ImportBericht = {};

  const verbindung = await ziel.connect();
  try {
    await verbindung.query("begin");

    for (const zieltabelle of REIHENFOLGE) {
      const { quelle: quelltabelle, spalten } = ZUORDNUNG[zieltabelle];
      const zielspalten = Object.keys(spalten);
      const quellspalten = Object.values(spalten);

      const auswahl = quellspalten.map(alsBezeichner).join(", ");
      const { rows } = await quelle.query(
        `select ${auswahl} from ${alsBezeichner(quellSchema)}.${alsBezeichner(quelltabelle)}`,
      );

      if (rows.length === 0) {
        bericht[zieltabelle] = 0;
        continue;
      }

      // Alle Zeilen einer Tabelle in EINER Anweisung einfuegen. 400 einzelne
      // Anweisungen waeren nicht falsch, aber unnoetig langsam.
      const werte: unknown[] = [];
      const platzhalter = rows.map((zeile: Record<string, unknown>) => {
        const stelle = quellspalten.map((q) => {
          werte.push(zeile[q] ?? null);
          return `$${werte.length}`;
        });
        return `(${stelle.join(", ")})`;
      });

      await verbindung.query(
        `insert into ${alsBezeichner(zieltabelle)} (${zielspalten.map(alsBezeichner).join(", ")})
         values ${platzhalter.join(", ")}`,
        werte,
      );

      bericht[zieltabelle] = rows.length;
    }

    await verbindung.query("commit");
    return bericht;
  } catch (fehler) {
    await verbindung.query("rollback");
    throw fehler;
  } finally {
    verbindung.release();
  }
}
