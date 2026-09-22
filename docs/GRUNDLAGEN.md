# Die Teile und was sie tun

Geschrieben für jemanden, der die Anwendung betreiben soll und dabei
verstehen will, was passiert, statt Befehle abzutippen.

## Zuerst ein Missverständnis aus dem Weg

**SQL lädt man nicht herunter.** SQL ist eine Sprache, so wie Deutsch
eine Sprache ist. Man kann sie nicht installieren.

Was man installiert, ist ein Programm, das diese Sprache versteht: eine
**Datenbank**. Unsere heisst PostgreSQL. Man sagt ihr Dinge auf SQL, zum
Beispiel `SELECT name FROM mitarbeiter`, und sie antwortet.

Und noch etwas: **du wirst kaum SQL schreiben.** In der Anwendung steckt
Drizzle, das aus TypeScript-Code SQL erzeugt. SQL brauchst du nur, wenn
du einmal von Hand in die Datenbank schauen willst.

**Docker brauchst du auch nicht.** Docker ist kein Bestandteil der
Anwendung, sondern eine andere Art, sie zu verpacken. Dazu unten mehr.

## Die vier Teile

```
   1. Betriebssystem        Ubuntu Server auf dem Mini-PC
      └─ 2. Node.js         führt den Programmcode aus
         └─ 3. Die Anwendung   unser Code
      └─ 4. PostgreSQL      speichert die Daten
```

### 1. Das Betriebssystem

Ubuntu Server. Wie Windows, nur ohne Bildfläche und dafür sparsam und
für Dauerbetrieb gebaut. Läuft jahrelang durch.

### 2. Node.js

Unser Programmcode ist in TypeScript geschrieben, das zu JavaScript
wird. JavaScript kennst du aus dem Browser. Node.js ist dasselbe
JavaScript, nur ausserhalb des Browsers, auf einem Server.

**Node ist der Motor, unser Code ist das Auto.** Ohne Motor passiert
nichts, aber der Motor allein fährt auch nirgendwohin.

### 3. Die Anwendung

Unser Code. Zwei Teile, die zusammengehören:

| Teil | Läuft wo | Aufgabe |
|---|---|---|
| **API** (`apps/api`) | auf dem Server | Rechte prüfen, mit der Datenbank reden |
| **Oberfläche** (`apps/web`) | im Browser des Benutzers | anzeigen und Eingaben aufnehmen |

Wichtig: die Oberfläche kennt die Datenbank **nicht**. Sie fragt immer
die API. Das ist keine Umständlichkeit, sondern der ganze Sinn: wer die
Oberfläche manipuliert, kommt trotzdem nicht an die Daten, weil dazwischen
die API steht und jede Anfrage selbst prüft.

### 4. PostgreSQL

Die Datenbank. Ein eigenes Programm, das neben der Anwendung läuft und
die Daten auf der Platte hält.

**Warum getrennt und nicht alles in einem Programm?** Weil die Daten
überleben müssen, wenn die Anwendung neu startet. Bei jedem Update wird
die Anwendung gestoppt und neu gestartet. Lägen die Daten in ihr, wären
sie dann weg. Die Datenbank läuft einfach weiter.

## Was du installierst, und was nicht

| | Installieren? | Warum |
|---|---|---|
| Ubuntu Server | ja | das Betriebssystem |
| Node.js | ja | führt unseren Code aus |
| PostgreSQL | ja | speichert die Daten |
| Caddy **oder** Tailscale | ja, eins davon | macht die Anwendung verschlüsselt erreichbar |
| **SQL** | **nein** | eine Sprache, kein Programm |
| **Docker** | **nein** | andere Verpackung derselben Sache, optional |
| **Die Anwendung** | nein | die holst du mit `git clone` |

Zwei Befehle decken die ersten drei ab:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql postgresql-client git
```

Alles Weitere macht `infra/installieren.sh`.

## Was passiert, wenn jemand die Seite öffnet

```
Browser                                  Mini-PC im Büro
   │
   │ 1. https://stunden... aufrufen
   ├──────────────────────────────────►  Caddy oder Tailscale
   │                                     entschlüsselt, reicht weiter
   │                                          │
   │                                          ▼  Port 3000
   │                                     Express (unsere API)
   │                                     prüft: wer bist du, darfst du das
   │                                          │
   │                                          ▼  Port 5432
   │                                     PostgreSQL
   │                                     "gib mir die Stunden vom September"
   │                                          │
   │ 2. Antwort als JSON                      ▼
   │◄──────────────────────────────────  zurück denselben Weg
   │
   │ 3. Der Browser baut daraus die Tabelle
   ▼
```

Drei Programme, zwei Ports, ein Weg. Wenn etwas nicht geht, ist die
Frage immer: **an welcher Stelle bricht es ab?** Dafür gibt es
`curl http://127.0.0.1:3000/api/health`, direkt auf dem Server. Kommt da
eine Antwort, liegt es am Webserver davor. Kommt keine, liegt es an der
Anwendung oder der Datenbank.

## Worauf du achten musst

### Die Datenbank gehört nicht ins Netz

PostgreSQL lauscht standardmässig nur auf der eigenen Maschine. Lass das
so. Es gibt keinen Grund, von aussen an die Datenbank zu kommen: die
Anwendung läuft ja daneben.

### Die Anwendung auch nicht direkt

Dieselbe Regel, und wir haben sie erst spät umgesetzt. Bis vor Kurzem
lauschte unsere API auf **allen** Netzwerkschnittstellen. Sie wäre damit
im ganzen Firmennetz unter `http://mini-pc:3000` erreichbar gewesen, an
der Verschlüsselung vorbei. Wer sich dort angemeldet hätte, hätte sein
Passwort im Klartext durchs Netz geschickt.

Jetzt lauscht sie nur noch auf `127.0.0.1`, also nur auf der eigenen
Maschine. Erreichbar wird sie über Caddy oder Tailscale, und die machen
TLS. Nur im Docker-Container steht `HOST=0.0.0.0`, weil dort `127.0.0.1`
das Innere des Containers wäre und die Weiterleitung nie ankäme.

**Die Regel dahinter:** ein Dienst soll nur so weit erreichbar sein, wie
er erreichbar sein muss. Nicht "es funktioniert ja" ist der Massstab,
sondern "wer könnte drankommen, der nicht soll".

### Zwei Geheimnisse

In `/etc/dels-stundentool.env` stehen zwei Dinge, die niemand sehen darf:

| | |
|---|---|
| `DATABASE_URL` | enthält das Datenbankpasswort |
| `SESSION_SECRET` | damit werden die Anmelde-Cookies unterschrieben |

Die Datei gehört `root` und hat die Rechte `600`, liest also nur root.
Sie gehört **niemals** ins Repository. Deshalb steht `.env` in
`.gitignore`, und im Repository liegen nur `.env.example`-Dateien ohne
echte Werte.

Wird `SESSION_SECRET` geändert, sind alle angemeldeten Benutzer
abgemeldet. Das ist kein Fehler, sondern der Zweck: die alten Cookies
tragen eine Unterschrift, die nicht mehr gilt.

### TLS ist nicht optional

Das Sitzungs-Cookie ist als `secure` gekennzeichnet. Der Browser schickt
so ein Cookie **nur** über eine verschlüsselte Verbindung zurück. Über
reines `http` funktioniert die Anmeldung deshalb nicht, auch im eigenen
Netz nicht.

Das ist Absicht. Ein Netz, in dem ein Gast-WLAN hängt, ist kein sicheres
Netz.

### Sicherungen an einen zweiten Ort

Eine Sicherung, die auf derselben Maschine liegt wie die Datenbank, hilft
gegen einen Bedienfehler. Gegen eine defekte Platte hilft sie nicht.

### Updates

```bash
sudo apt-get update && sudo apt-get upgrade
```

Ab und zu. Das ist der eigentliche Preis des Selbstbetriebs.

## Und was ist jetzt Docker

Docker verpackt ein Programm zusammen mit allem, was es zum Laufen
braucht, in ein **Bild**. Startet man das Bild, entsteht ein
**Container**: eine abgeschottete Umgebung, in der genau die richtige
Node-Version und die richtigen Bibliotheken liegen, egal was auf der
Maschine sonst installiert ist.

| | Ohne Docker | Mit Docker |
|---|---|---|
| Node installieren | du | steckt im Bild |
| Node-Version | die der Maschine | fest im Bild |
| PostgreSQL | du installierst es | eigener Container |
| Update | `git pull`, Skript nochmal | neues Bild bauen, tauschen |
| Zurückrollen | Sicherung zurückspielen | altes Bild wieder starten |
| Was du verstehen musst | Linux | Linux **und** Docker |

**Für eine Maschine und zwei Programme ist Docker ein Nullsummenspiel.**
Es nimmt dir Arbeit ab und legt eine Schicht darüber, die du verstehen
musst, wenn etwas klemmt.

**Ab drei, vier Diensten gewinnt Docker deutlich**, und in Firmen ist es
Standard. Beides liegt hier fertig im Projekt:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Und die CI baut das Bild bei jedem Push, startet es gegen eine echte
Datenbank und prüft, ob es antwortet. Beide Wege sind geprüft, du hast
also die Wahl, ohne ein Risiko einzugehen.
