// TIDEWATER — make.fun handover program.
//
// Copies the playable game (game/) and its screenshots (screenshots/)
// into the output directory, then writes dossier.json using the kit's
// buildDossier so the platform scores exactly the bytes that were built
// and playtested locally. Run it with:
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The caps below are the bounty's own: at most 160 KiB of source text in
// the dossier, up to 4 screenshots of at most 256 KiB each, and the game
// tree capped at 993 entries / 48 MiB so the whole output stays inside
// the grader's 1000-entry limit.

import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? join(here, 'out');

// Start from a clean output directory so stale files from an earlier
// build can never leak into the scored entry.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log(`tidewater: handed over game/ + screenshots/ and wrote dossier.json (${dossier.length} bytes) to ${outDir}`);
