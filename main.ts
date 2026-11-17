// main.ts — TIDEWATER's handover program for the make.fun grader.
//
// What it does: assemble the finished entry in the output directory — a
// faithful copy of the playable game (game/) and the four judge screenshots
// (screenshots/) — then describe that tree with the vendored buildDossier()
// and save the result as dossier.json. The scorer runs the same library on
// the same tree and expects identical bytes, so nothing is transformed on
// the way through: copies are copies, and the dossier is the library's own
// canonical output.
//
// Grader-shaped care, learned the hard way:
//   * The output directory arrives as a MOUNT POINT. It must never be
//     deleted or recreated — that throws EPERM. We ensure it exists, then
//     clear only what is inside it.
//   * The repository is mounted READ-ONLY. This program writes inside the
//     output directory and nowhere else.
//   * Everything is located from this file's own URL, never from the
//     working directory, and the whole run is a few small file copies plus
//     one hashing pass — far inside the grader's time and memory budget.
//
// Run locally the same way the grader does:
//   MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = dirname(fileURLToPath(import.meta.url));

const requested = process.env.MAKEFUN_OUTPUT_DIR || 'out';
const outDir = isAbsolute(requested) ? requested : resolve(process.cwd(), requested);

// Ensure the output directory exists, then empty it — contents only,
// never the directory itself (see the mount-point note above).
mkdirSync(outDir, { recursive: true });
for (const entry of readdirSync(outDir)) {
  rmSync(join(outDir, entry), { recursive: true, force: true });
}

// The two halves of the entry, copied exactly as they stand in the repo.
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(repoDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

// The bounty's caps, as handed out in its gate: how much source text the
// dossier may carry, how many screenshots (and how large), and how large
// the game tree itself may grow.
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

const dossier = buildDossier(outDir, caps);
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log('tidewater: entry assembled in ' + outDir + ' (dossier ' + dossier.length + ' bytes)');
