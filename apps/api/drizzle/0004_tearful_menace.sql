CREATE TABLE "objekt_abo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"objekt_id" uuid NOT NULL,
	"gueltig_ab" date NOT NULL,
	"betrag" numeric(12, 2) NOT NULL,
	"bemerkung" text,
	"erfasst_von" text,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "objekt_abo" ADD CONSTRAINT "objekt_abo_objekt_id_objekte_id_fk" FOREIGN KEY ("objekt_id") REFERENCES "public"."objekte"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "objekt_abo_objekt_tag_idx" ON "objekt_abo" USING btree ("objekt_id","gueltig_ab");--> statement-breakpoint
CREATE INDEX "objekt_abo_objekt_idx" ON "objekt_abo" USING btree ("objekt_id","gueltig_ab");--> statement-breakpoint
-- Bestehende Preise in die Historie heben.
--
-- Jedes Objekt, das heute einen Abo-Betrag hat, bekommt einen Eintrag,
-- der ab dem ersten erfassten Kalkulationsmonat gilt. Gibt es noch
-- keinen Monat, gilt der 1. Januar des laufenden Jahres. Ohne diesen
-- Schritt sähe die Historie so aus, als hätte es vorher nie einen
-- Preis gegeben, und ein neu angelegter Monat bekäme überall 0.
INSERT INTO "objekt_abo" ("objekt_id", "gueltig_ab", "betrag", "bemerkung", "erfasst_von")
SELECT
  o."id",
  COALESCE((SELECT MIN("monat") FROM "kalk_monat"), date_trunc('year', now())::date),
  o."abo_betrag",
  'Aus dem Stammblatt übernommen, als die Preis-Historie eingeführt wurde.',
  'Migration'
FROM "objekte" o
WHERE o."abo_betrag" IS NOT NULL AND o."abo_betrag" > 0;
