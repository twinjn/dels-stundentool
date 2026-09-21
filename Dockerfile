# Produktionsbild: eine Anwendung, die API und Oberflaeche zusammen ausliefert.
#
# node:22-slim statt alpine, mit Absicht: argon2 ist eine native
# Bibliothek. Fuer glibc (Debian) gibt es fertige Binaerpakete, fuer musl
# (Alpine) muesste beim Bauen ein C-Compiler her. Das macht das Bild
# groesser, den Bau langsamer und gelegentlich kaputt.

# --- Bauen -------------------------------------------------------------
FROM node:22-slim AS bau
WORKDIR /app

# Erst nur die Paketlisten kopieren: solange sie sich nicht aendern,
# spart Docker beim naechsten Bau die ganze Installation.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# npm ci holt xlsx von cdn.sheetjs.com. Ohne Netz dorthin scheitert der Bau.
RUN npm ci

COPY . .
RUN npm run build

# Entwicklungsabhaengigkeiten wegwerfen. Danach bleiben nur die Pakete,
# die zur Laufzeit gebraucht werden.
RUN npm prune --omit=dev

# Quelltext und Testdateien braucht das laufende Bild nicht.
RUN rm -rf apps/api/src apps/web/src packages/shared/src legacy .git

# --- Laufen ------------------------------------------------------------
FROM node:22-slim
ENV NODE_ENV=production

# pg_dump und psql fuer die Sicherungsskripte.
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client tini \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Als normaler Benutzer laufen, nicht als root. Das Bild bringt dafuer
# schon einen Benutzer "node" mit.
COPY --from=bau --chown=node:node /app /app
USER node

EXPOSE 3000

# tini als Startprozess: ohne ihn laeuft Node als Prozess 1 und bekommt
# das Signal zum Beenden nicht richtig mit. Container brauchen dann jedes
# Mal zehn Sekunden zum Stoppen.
ENTRYPOINT ["/usr/bin/tini", "--"]

# Vor dem Start die Migrationen anwenden. Sie sind mehrfach ausfuehrbar,
# ein Neustart schadet also nicht.
CMD ["sh", "-c", "node apps/api/dist/db/migrieren.js && node apps/api/dist/server.js"]
