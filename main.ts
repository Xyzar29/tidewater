// TIDEWATER — make.fun packaging entry.
// Copies the static game plus any screenshots into the output directory and
// writes the dossier the bounty checker grades. No build step: the game is
// plain ES modules + a vendored three.js, copied verbatim.

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

// Resolve paths relative to this file so the script works from any cwd.
const root = join(fileURLToPath(new URL(".", import.meta.url)), ".");
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

// Fresh output directory, then mirror the playable game into it.
mkdirSync(outDir, { recursive: true });
cpSync(join(root, "game"), join(outDir, "game"), { recursive: true });

// Screenshots are optional at packaging time; include them when present.
const shotsDir = join(root, "screenshots");
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outDir, "screenshots"), { recursive: true });
}

// The dossier describes the bundle under the bounty limits for gta6-01.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, "dossier.json"), JSON.stringify(dossier, null, 2));
console.log("tidewater packaged ->", outDir);
