// TIDEWATER — handover program for the make.fun gta6-01 entry.
//
// What it does, in order:
//   1. wipes and recreates the output directory (MAKEFUN_OUTPUT_DIR),
//   2. copies the playable game (game/) and the screenshots (screenshots/)
//      into it, untouched,
//   3. asks the vendored make.fun library to describe that directory as a
//      dossier, using the same caps the bounty scorer uses,
//   4. writes the result to dossier.json in the output directory.
//
// Run it with:  MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? 'out';

// Start from a clean slate so stale files can never leak into the handover.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// The entry is exactly these two trees, copied as they are.
cpSync('game', join(outDir, 'game'), { recursive: true });
cpSync('screenshots', join(outDir, 'screenshots'), { recursive: true });

// The caps mirror the bounty's gate: at most ~160 KB of source text in the
// dossier, up to 4 screenshots of at most 256 KiB each, and room for 993
// game files (the grader's own output ceiling is 1000 entries in total).
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`tidewater: handed over game/ + screenshots/ to ${outDir}/ with dossier.json`);
