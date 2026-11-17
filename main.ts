// TIDEWATER — entry handover.
//
// The scorer does not grade the repo directly; it grades a flat output
// directory holding the playable game, the screenshots, and a dossier that
// describes both. This program builds that directory:
//
//   1. wipe and recreate $MAKEFUN_OUTPUT_DIR (default ./out),
//   2. copy game/ and screenshots/ across, byte for byte,
//   3. write dossier.json with the kit's own buildDossier, held to the
//      same caps the scorer uses, so what is handed in is exactly what
//      the kit would produce from these files — no surprises either way.
//
// Run it with:  MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? join(here, 'out');

// The handover caps, mirroring the bounty's gate: the dossier text budget,
// at most four screenshots of at most 256 KiB each, and the game tree's
// entry and byte budgets.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, CAPS);
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log(`tidewater: handed in game/ + screenshots/ + dossier.json (${dossier.length} bytes) to ${outDir}`);
