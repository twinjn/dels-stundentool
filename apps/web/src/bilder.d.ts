/**
 * Damit TypeScript den Import einer PNG-Datei kennt.
 *
 * Vite macht aus `import logo from "./x.png"` zur Bauzeit eine URL als
 * Zeichenkette. Ohne diese Deklaration kennt der Typpruefer den Import
 * nicht und bricht ab, obwohl der Bau funktionieren wuerde.
 */
declare module "*.png" {
  const pfad: string;
  export default pfad;
}
