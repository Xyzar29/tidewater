// main.ts — TIDEWATER's handover program for make.fun.
//
// What it does, in plain terms: it assembles the deliverable entry in the
// output directory — a clean copy of the playable game (game/) and of the
// four screenshots (screenshots/) — and then asks the vendored
// buildDossier() to describe that entry in dossier.json, held to the
// bounty's caps. The scorer runs the same library on the same tree and
// expects the dossier bytes to match, so this program copies files
// faithfully and changes nothing about them on the way.
//
// Run it with an output directory in the environment:
//   MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

// The caps come straight from the bounty's gate: how much source text the
// dossier may hold, how many screenshots (and how large each may be), and
// how many files / bytes the game tree itself may contain.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

const here = new URL('.', import.meta.url).pathname;
const outDir = process.env.MAKEFUN_OUTPUT_DIR || join(here, 'out');

// Start from an empty output directory so stale files can never leak in.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// Copy the two halves of the entry exactly as they stand in the repo.
cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

// Describe the assembled entry and write the dossier beside the copies.
const dossier = buildDossier(outDir, CAPS);
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log(`tidewater: entry assembled in ${outDir} (dossier ${dossier.length} bytes)`);
