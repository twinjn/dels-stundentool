/**
 * Kalkulation: Ansaetze, Objekte und Personal je Monat.
 *
 * Gerechnet wird NICHT hier, sondern mit rechne() aus @dels/shared.
 * Diese Route liefert die Eingangsdaten, der Browser rechnet damit
 * sofort, waehrend jemand an einem Ansatz dreht. Dieselbe Funktion
 * benutzt spaeter der Export auf dem Server. Eine Rechenlogik, zwei
 * Verwendungen, keine zweite Fassung, die auseinanderlaufen kann.
 *
 * Der Monat ist immer der erste Tag des Monats. Pro Monat werden die
 * damals gueltigen Ansaetze festgehalten, sonst rechnet man alte Monate
 * mit heutigen Saetzen nach. Genau dieser Fehler steckte im Excel.
 */
import { and, desc, eq, lt } from "drizzle-orm";
import { Router } from "express";
import { z as zod } from "zod";
import { brauchtRecht } from "../auth/guards.js";
import { db } from "../db/index.js";
import {
  kalkAdminkosten,
  kalkMonat,
  kalkObjektMonat,
  kalkPersonMonat,
  objekte,
} from "../db/schema.js";
import { HttpFehler, nichtGefunden } from "../fehler.js";
import { kalkulationsdaten } from "../kalkulation/daten.js";
import { protokolliere, unterschiede } from "../protokoll.js";

export const kalkulationRouter = Router();

// Die ganze Kalkulation ist admin-Sache.
kalkulationRouter.use(brauchtRecht("kalkulation:lesen"));

const MonatSchema = zod
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-01$/, "Monat als JJJJ-MM-01 erwartet.");

const IdSchema = zod.uuid();

/** Welche Monate sind angelegt. */
kalkulationRouter.get("/monate", async (_req, res) => {
  const liste = await db
    .select({ monat: kalkMonat.monat, notiz: kalkMonat.notiz })
    .from(kalkMonat)
    .orderBy(desc(kalkMonat.monat));
  res.json(liste);
});

/** Alle Eingangsdaten eines Monats. */
kalkulationRouter.get("/:monat", async (req, res) => {
  const monat = MonatSchema.parse(req.params.monat);
  res.json(await kalkulationsdaten(monat));
});

/**
 * Einen Monat anlegen.
 *
 * Vorlage ist der zuletzt angelegte Monat: Ansaetze, Objektzeilen,
 * Personalzeilen und Adminposten werden uebernommen. Gibt es noch keinen,
 * kommen die Standardwerte aus der Tabelle und alle aktiven Objekte.
 */
kalkulationRouter.post("/:monat", brauchtRecht("kalkulation:schreiben"), async (req, res) => {
  const monat = MonatSchema.parse(req.params.monat);

  const [schon] = await db.select().from(kalkMonat).where(eq(kalkMonat.monat, monat));
  if (schon) throw new HttpFehler(409, `${monat} ist bereits angelegt.`, "schon_vorhanden");

  const [vorlage] = await db
    .select()
    .from(kalkMonat)
    .where(lt(kalkMonat.monat, monat))
    .orderBy(desc(kalkMonat.monat))
    .limit(1);

  const angelegt = await db.transaction(async (tx) => {
    if (vorlage) {
      const { monat: _alt, erstelltAm: _erstellt, notiz: _notiz, ...ansaetze } = vorlage;
      await tx.insert(kalkMonat).values({ monat, ...ansaetze });

      const objektzeilen = await tx
        .select()
        .from(kalkObjektMonat)
        .where(eq(kalkObjektMonat.monat, vorlage.monat));
      if (objektzeilen.length > 0) {
        await tx
          .insert(kalkObjektMonat)
          .values(objektzeilen.map(({ monat: _m, ...rest }) => ({ monat, ...rest })));
      }

      const personzeilen = await tx
        .select()
        .from(kalkPersonMonat)
        .where(eq(kalkPersonMonat.monat, vorlage.monat));
      if (personzeilen.length > 0) {
        await tx
          .insert(kalkPersonMonat)
          .values(personzeilen.map(({ monat: _m, ...rest }) => ({ monat, ...rest })));
      }

      const posten = await tx
        .select()
        .from(kalkAdminkosten)
        .where(eq(kalkAdminkosten.monat, vorlage.monat));
      if (posten.length > 0) {
        await tx
          .insert(kalkAdminkosten)
          .values(posten.map(({ id: _i, monat: _m, ...rest }) => ({ monat, ...rest })));
      }

      return {
        vorlage: vorlage.monat,
        objekte: objektzeilen.length,
        personen: personzeilen.length,
      };
    }

    // Kein Vormonat: Standardansaetze und alle aktiven Objekte.
    await tx.insert(kalkMonat).values({ monat });

    const aktive = await db
      .select({ id: objekte.id, aboBetrag: objekte.aboBetrag })
      .from(objekte)
      .where(eq(objekte.aktiv, true));

    if (aktive.length > 0) {
      await tx
        .insert(kalkObjektMonat)
        .values(
          aktive.map((o) => ({ monat, objektId: o.id, aboBetrag: o.aboBetrag, aktiv: true })),
        );
    }

    return { vorlage: null, objekte: aktive.length, personen: 0 };
  });

  await protokolliere({
    benutzer: req.benutzer,
    aktion: "anlegen",
    tabelle: "kalk_monat",
    datensatzId: monat,
    nachher: angelegt,
  });

  res.status(201).json({ monat, ...angelegt });
});

/** Die Ansaetze eines Monats aendern. */
const AnsaetzeSchema = zod
  .object({
    ahv: zod.union([zod.string(), zod.number()]),
    alv: zod.union([zod.string(), zod.number()]),
    nbu: zod.union([zod.string(), zod.number()]),
    bu: zod.union([zod.string(), zod.number()]),
    ktgObjekt: zod.union([zod.string(), zod.number()]),
    ktgPersonal: zod.union([zod.string(), zod.number()]),
    rpk: zod.union([zod.string(), zod.number()]),
    fak: zod.union([zod.string(), zod.number()]),
    ml13: zod.union([zod.string(), zod.number()]),
    nbuSchwelle: zod.union([zod.string(), zod.number()]),
    nbuTraegtAg: zod.boolean(),
    bvgSatz: zod.union([zod.string(), zod.number()]),
    bvgEintritt: zod.union([zod.string(), zod.number()]),
    bvgKoord: zod.union([zod.string(), zod.number()]),
    bvgMin: zod.union([zod.string(), zod.number()]),
    bvgMax: zod.union([zod.string(), zod.number()]),
    mat: zod.union([zod.string(), zod.number()]),
    mas: zod.union([zod.string(), zod.number()]),
    trs: zod.union([zod.string(), zod.number()]),
    trsTopf: zod.union([zod.string(), zod.number()]),
    trsSchluessel: zod.enum(["abos", "objekt"]),
    adminReserve: zod.union([zod.string(), zod.number()]),
    notiz: zod.string().max(2000).nullable(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Es wurde nichts geändert.");

kalkulationRouter.patch("/:monat", brauchtRecht("kalkulation:schreiben"), async (req, res) => {
  const monat = MonatSchema.parse(req.params.monat);
  const daten = AnsaetzeSchema.parse(req.body);

  const [vorher] = await db.select().from(kalkMonat).where(eq(kalkMonat.monat, monat));
  if (!vorher) throw nichtGefunden(`Für ${monat} ist noch kein Monat angelegt.`);

  const werte = Object.fromEntries(
    Object.entries(daten).map(([feld, wert]) => [
      feld,
      typeof wert === "number" ? String(wert) : wert,
    ]),
  );

  const [geaendert] = await db
    .update(kalkMonat)
    .set(werte)
    .where(eq(kalkMonat.monat, monat))
    .returning();

  const diff = unterschiede(vorher as Record<string, unknown>, werte);
  await protokolliere({
    benutzer: req.benutzer,
    aktion: "aendern",
    tabelle: "kalk_monat",
    datensatzId: monat,
    vorher: diff.vorher,
    nachher: diff.nachher,
  });

  res.json(geaendert);
});

/** Eine Objektzeile des Monats aendern. */
const ObjektZeileSchema = zod
  .object({
    aboBetrag: zod.union([zod.string(), zod.number()]).nullable(),
    stdManuell: zod.union([zod.string(), zod.number()]).nullable(),
    lohnManuell: zod.union([zod.string(), zod.number()]).nullable(),
    ma: zod.union([zod.string(), zod.number()]),
    aktiv: zod.boolean(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Es wurde nichts geändert.");

kalkulationRouter.patch(
  "/:monat/objekt/:objektId",
  brauchtRecht("kalkulation:schreiben"),
  async (req, res) => {
    const monat = MonatSchema.parse(req.params.monat);
    const objektId = IdSchema.parse(req.params.objektId);
    const daten = ObjektZeileSchema.parse(req.body);

    const werte = Object.fromEntries(
      Object.entries(daten).map(([f, w]) => [f, typeof w === "number" ? String(w) : w]),
    );

    const [geaendert] = await db
      .update(kalkObjektMonat)
      .set(werte)
      .where(and(eq(kalkObjektMonat.monat, monat), eq(kalkObjektMonat.objektId, objektId)))
      .returning();

    if (!geaendert) throw nichtGefunden("Diese Objektzeile gibt es in diesem Monat nicht.");
    res.json(geaendert);
  },
);

/** Eine Personalzeile des Monats aendern. */
const PersonZeileSchema = zod
  .object({
    lohn: zod.union([zod.string(), zod.number()]),
    spesen: zod.union([zod.string(), zod.number()]),
    ml13: zod.boolean(),
    abzugAhv: zod.boolean(),
    abzugAlv: zod.boolean(),
    abzugRpk: zod.boolean(),
    abzugFak: zod.boolean(),
    fakManuell: zod.union([zod.string(), zod.number()]).nullable(),
    bvg: zod.boolean(),
    bvgManuell: zod.union([zod.string(), zod.number()]).nullable(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "Es wurde nichts geändert.");

kalkulationRouter.patch(
  "/:monat/person/:mitarbeiterId",
  brauchtRecht("kalkulation:schreiben"),
  async (req, res) => {
    const monat = MonatSchema.parse(req.params.monat);
    const mitarbeiterId = IdSchema.parse(req.params.mitarbeiterId);
    const daten = PersonZeileSchema.parse(req.body);

    const werte = Object.fromEntries(
      Object.entries(daten).map(([f, w]) => [f, typeof w === "number" ? String(w) : w]),
    );

    const [geaendert] = await db
      .update(kalkPersonMonat)
      .set(werte)
      .where(
        and(eq(kalkPersonMonat.monat, monat), eq(kalkPersonMonat.mitarbeiterId, mitarbeiterId)),
      )
      .returning();

    if (!geaendert) throw nichtGefunden("Diese Personalzeile gibt es in diesem Monat nicht.");
    res.json(geaendert);
  },
);

/** Adminposten anlegen, aendern, loeschen. */
const PostenSchema = zod.object({
  position: zod.string().trim().min(1, "Bezeichnung fehlt.").max(120),
  betrag: zod.union([zod.string(), zod.number()]),
  sortierung: zod.number().int().optional(),
});

kalkulationRouter.post(
  "/:monat/adminkosten",
  brauchtRecht("kalkulation:schreiben"),
  async (req, res) => {
    const monat = MonatSchema.parse(req.params.monat);
    const daten = PostenSchema.parse(req.body);

    const [neu] = await db
      .insert(kalkAdminkosten)
      .values({
        monat,
        position: daten.position,
        betrag: String(daten.betrag),
        sortierung: daten.sortierung ?? 0,
      })
      .returning();

    res.status(201).json(neu);
  },
);

kalkulationRouter.patch(
  "/:monat/adminkosten/:id",
  brauchtRecht("kalkulation:schreiben"),
  async (req, res) => {
    const id = IdSchema.parse(req.params.id);
    const daten = PostenSchema.partial().parse(req.body);

    const [geaendert] = await db
      .update(kalkAdminkosten)
      .set({
        ...(daten.position !== undefined ? { position: daten.position } : {}),
        ...(daten.betrag !== undefined ? { betrag: String(daten.betrag) } : {}),
        ...(daten.sortierung !== undefined ? { sortierung: daten.sortierung } : {}),
      })
      .where(eq(kalkAdminkosten.id, id))
      .returning();

    if (!geaendert) throw nichtGefunden("Diesen Posten gibt es nicht.");
    res.json(geaendert);
  },
);

kalkulationRouter.delete(
  "/:monat/adminkosten/:id",
  brauchtRecht("kalkulation:schreiben"),
  async (req, res) => {
    const id = IdSchema.parse(req.params.id);
    const geloescht = await db
      .delete(kalkAdminkosten)
      .where(eq(kalkAdminkosten.id, id))
      .returning({ id: kalkAdminkosten.id });

    if (geloescht.length === 0) throw nichtGefunden("Diesen Posten gibt es nicht.");
    res.status(204).end();
  },
);
