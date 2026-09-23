CREATE TYPE "public"."lohnart" AS ENUM('monat', 'stunde');--> statement-breakpoint
CREATE TABLE "ferien_uebertrag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mitarbeiter_id" uuid NOT NULL,
	"jahr" integer NOT NULL,
	"tage" numeric(6, 2) NOT NULL,
	"bemerkung" text,
	"erfasst_von" text,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ferien_uebertrag_tage_grenzen" CHECK ("ferien_uebertrag"."tage" between -100 and 100)
);
--> statement-breakpoint
ALTER TABLE "mitarbeiter" ADD COLUMN "lohnart" "lohnart" DEFAULT 'stunde' NOT NULL;--> statement-breakpoint
ALTER TABLE "ferien_uebertrag" ADD CONSTRAINT "ferien_uebertrag_mitarbeiter_id_mitarbeiter_id_fk" FOREIGN KEY ("mitarbeiter_id") REFERENCES "public"."mitarbeiter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ferien_uebertrag_person_jahr_idx" ON "ferien_uebertrag" USING btree ("mitarbeiter_id","jahr");--> statement-breakpoint
-- Bestandsdaten auf die neue Spalte umstellen.
--
-- Die Vorgabe der Spalte ist 'stunde', weil das in einer Reinigungsfirma
-- der Normalfall ist. Wer aber bisher als Monatslohn gefuehrt wurde oder
-- einen Monatslohn hinterlegt hat, muss 'monat' bekommen, sonst rechnet
-- die Ferienrechnung ab dem ersten Tag fuer diese Leute das Falsche.
--
-- Zwei Kriterien statt einem, weil beide Quellen luecken haben: die
-- Stufe ist ein Freitextfeld aus dem Excel und mal leer, und ein
-- hinterlegter Monatslohn ist der handfestere Beleg.
UPDATE "mitarbeiter"
SET "lohnart" = 'monat'
WHERE lower(trim(coalesce("mitarbeiterstufe", ''))) = 'monatslohn'
   OR coalesce("monatslohn", 0) > 0;
