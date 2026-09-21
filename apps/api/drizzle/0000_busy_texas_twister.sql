CREATE TYPE "public"."eintragsart" AS ENUM('arbeit', 'ferien', 'krankheit', 'unfall', 'feiertag', 'sonstiges', 'spesen');--> statement-breakpoint
CREATE TYPE "public"."rolle" AS ENUM('admin', 'buero');--> statement-breakpoint
CREATE TYPE "public"."verteilschluessel" AS ENUM('abos', 'objekt');--> statement-breakpoint
CREATE TABLE "benutzer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"passwort_hash" text NOT NULL,
	"name" text NOT NULL,
	"rolle" "rolle" DEFAULT 'buero' NOT NULL,
	"aktiv" boolean DEFAULT true NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"letzter_login_am" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "eintraege" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mitarbeiter_id" uuid NOT NULL,
	"objekt_id" uuid,
	"datum" date NOT NULL,
	"art" "eintragsart" NOT NULL,
	"wert" numeric(10, 2) NOT NULL,
	"notiz" text,
	"erfasst_von" uuid,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone,
	CONSTRAINT "eintraege_arbeit_braucht_objekt" CHECK ("eintraege"."art" <> 'arbeit' OR "eintraege"."objekt_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "kalk_adminkosten" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monat" date NOT NULL,
	"position" text NOT NULL,
	"betrag" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sortierung" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kalk_monat" (
	"monat" date PRIMARY KEY NOT NULL,
	"ahv" numeric(10, 6) DEFAULT '0.053' NOT NULL,
	"alv" numeric(10, 6) DEFAULT '0.011' NOT NULL,
	"nbu" numeric(10, 6) DEFAULT '0.0138' NOT NULL,
	"bu" numeric(10, 6) DEFAULT '0.014494' NOT NULL,
	"ktg_objekt" numeric(10, 6) DEFAULT '0.00796' NOT NULL,
	"ktg_personal" numeric(10, 6) DEFAULT '0.00825' NOT NULL,
	"rpk" numeric(10, 6) DEFAULT '0.002' NOT NULL,
	"fak" numeric(10, 6) DEFAULT '0.012' NOT NULL,
	"ml13" numeric(10, 6) DEFAULT '0.0833' NOT NULL,
	"nbu_schwelle" numeric(8, 2) DEFAULT '8' NOT NULL,
	"nbu_traegt_ag" boolean DEFAULT false NOT NULL,
	"bvg_satz" numeric(10, 6) DEFAULT '0.07' NOT NULL,
	"bvg_eintritt" numeric(12, 2) DEFAULT '22680' NOT NULL,
	"bvg_koord" numeric(12, 2) DEFAULT '26460' NOT NULL,
	"bvg_min" numeric(12, 2) DEFAULT '3780' NOT NULL,
	"bvg_max" numeric(12, 2) DEFAULT '64260' NOT NULL,
	"mat" numeric(12, 2) DEFAULT '15' NOT NULL,
	"mas" numeric(12, 2) DEFAULT '15' NOT NULL,
	"trs" numeric(12, 2) DEFAULT '0' NOT NULL,
	"trs_topf" numeric(12, 2) DEFAULT '0' NOT NULL,
	"trs_schluessel" "verteilschluessel" DEFAULT 'abos' NOT NULL,
	"admin_reserve" numeric(10, 6) DEFAULT '0.10' NOT NULL,
	"notiz" text,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kalk_objekt_monat" (
	"monat" date NOT NULL,
	"objekt_id" uuid NOT NULL,
	"abo_betrag" numeric(12, 2),
	"std_manuell" numeric(8, 2),
	"lohn_manuell" numeric(12, 2),
	"ma" numeric(6, 2) DEFAULT '1' NOT NULL,
	"aktiv" boolean DEFAULT true NOT NULL,
	CONSTRAINT "kalk_objekt_monat_monat_objekt_id_pk" PRIMARY KEY("monat","objekt_id")
);
--> statement-breakpoint
CREATE TABLE "kalk_person_monat" (
	"monat" date NOT NULL,
	"mitarbeiter_id" uuid NOT NULL,
	"lohn" numeric(12, 2) DEFAULT '0' NOT NULL,
	"spesen" numeric(12, 2) DEFAULT '0' NOT NULL,
	"ml13" boolean DEFAULT false NOT NULL,
	"abzug_ahv" boolean DEFAULT true NOT NULL,
	"abzug_alv" boolean DEFAULT true NOT NULL,
	"abzug_rpk" boolean DEFAULT true NOT NULL,
	"abzug_fak" boolean DEFAULT true NOT NULL,
	"fak_manuell" numeric(12, 2),
	"bvg" boolean DEFAULT true NOT NULL,
	"bvg_manuell" numeric(12, 2),
	CONSTRAINT "kalk_person_monat_monat_mitarbeiter_id_pk" PRIMARY KEY("monat","mitarbeiter_id")
);
--> statement-breakpoint
CREATE TABLE "mitarbeiter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"personalnummer" text,
	"mitarbeiterstufe" text,
	"eintrittsdatum" date,
	"austrittsdatum" date,
	"aktiv" boolean DEFAULT true NOT NULL,
	"ferienanspruch" numeric(5, 2) DEFAULT '25' NOT NULL,
	"soll_pro_tag" numeric(5, 2) DEFAULT '8.4' NOT NULL,
	"stundenlohn" numeric(12, 2),
	"monatslohn" numeric(12, 2),
	"telefon" text,
	"email" text,
	"strasse" text,
	"plz" text,
	"ort" text,
	"geburtsdatum" date,
	"ahv_nummer" text,
	"iban" text,
	"notizen" text,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objekte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"objekt_nr" text,
	"kunde" text,
	"strasse" text,
	"plz" text,
	"ort" text,
	"abo_betrag" numeric(12, 2),
	"aktiv" boolean DEFAULT true NOT NULL,
	"notizen" text,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protokoll" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zeitpunkt" timestamp with time zone DEFAULT now() NOT NULL,
	"benutzer_id" uuid,
	"benutzer_name" text,
	"aktion" text NOT NULL,
	"tabelle" text NOT NULL,
	"datensatz_id" text,
	"vorher" jsonb,
	"nachher" jsonb
);
--> statement-breakpoint
CREATE TABLE "sitzungen" (
	"id" text PRIMARY KEY NOT NULL,
	"benutzer_id" uuid NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"laeuft_ab_am" timestamp with time zone NOT NULL,
	"letzte_aktivitaet" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"browser" text
);
--> statement-breakpoint
ALTER TABLE "eintraege" ADD CONSTRAINT "eintraege_mitarbeiter_id_mitarbeiter_id_fk" FOREIGN KEY ("mitarbeiter_id") REFERENCES "public"."mitarbeiter"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eintraege" ADD CONSTRAINT "eintraege_objekt_id_objekte_id_fk" FOREIGN KEY ("objekt_id") REFERENCES "public"."objekte"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eintraege" ADD CONSTRAINT "eintraege_erfasst_von_benutzer_id_fk" FOREIGN KEY ("erfasst_von") REFERENCES "public"."benutzer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalk_adminkosten" ADD CONSTRAINT "kalk_adminkosten_monat_kalk_monat_monat_fk" FOREIGN KEY ("monat") REFERENCES "public"."kalk_monat"("monat") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalk_objekt_monat" ADD CONSTRAINT "kalk_objekt_monat_monat_kalk_monat_monat_fk" FOREIGN KEY ("monat") REFERENCES "public"."kalk_monat"("monat") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalk_objekt_monat" ADD CONSTRAINT "kalk_objekt_monat_objekt_id_objekte_id_fk" FOREIGN KEY ("objekt_id") REFERENCES "public"."objekte"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalk_person_monat" ADD CONSTRAINT "kalk_person_monat_monat_kalk_monat_monat_fk" FOREIGN KEY ("monat") REFERENCES "public"."kalk_monat"("monat") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalk_person_monat" ADD CONSTRAINT "kalk_person_monat_mitarbeiter_id_mitarbeiter_id_fk" FOREIGN KEY ("mitarbeiter_id") REFERENCES "public"."mitarbeiter"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protokoll" ADD CONSTRAINT "protokoll_benutzer_id_benutzer_id_fk" FOREIGN KEY ("benutzer_id") REFERENCES "public"."benutzer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sitzungen" ADD CONSTRAINT "sitzungen_benutzer_id_benutzer_id_fk" FOREIGN KEY ("benutzer_id") REFERENCES "public"."benutzer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "benutzer_email_eindeutig" ON "benutzer" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "eintraege_mitarbeiter_datum_idx" ON "eintraege" USING btree ("mitarbeiter_id","datum");--> statement-breakpoint
CREATE INDEX "eintraege_datum_idx" ON "eintraege" USING btree ("datum");--> statement-breakpoint
CREATE INDEX "eintraege_objekt_idx" ON "eintraege" USING btree ("objekt_id");--> statement-breakpoint
CREATE INDEX "kalk_adminkosten_monat_idx" ON "kalk_adminkosten" USING btree ("monat");--> statement-breakpoint
CREATE INDEX "protokoll_zeitpunkt_idx" ON "protokoll" USING btree ("zeitpunkt");--> statement-breakpoint
CREATE INDEX "protokoll_tabelle_idx" ON "protokoll" USING btree ("tabelle","datensatz_id");--> statement-breakpoint
CREATE INDEX "sitzungen_benutzer_idx" ON "sitzungen" USING btree ("benutzer_id");--> statement-breakpoint
CREATE INDEX "sitzungen_ablauf_idx" ON "sitzungen" USING btree ("laeuft_ab_am");