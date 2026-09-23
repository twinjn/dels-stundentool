// ESLint im neuen "flat config"-Format (ab ESLint 9).
// Der Linter meckert Dinge an, die zwar durchlaufen, aber Fehler
// wahrscheinlich machen: ungenutzte Variablen, vergessene await, ...
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Das Altsystem lassen wir in Ruhe, es soll unverändert lauffaehig bleiben.
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "legacy/**"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["apps/api/**/*.ts", "packages/shared/**/*.ts"],
    languageOptions: { globals: globals.node },
  },

  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
  },

  {
    rules: {
      // Ein Parameter, der absichtlich ungenutzt ist, wird mit _ markiert.
      // Kommt bei Express-Handlern staendig vor: (_req, res).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
