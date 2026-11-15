// TIDELOCK's build program. It stages game/ and screenshots/ into the
// output directory the grader reads, then writes dossier.json through the
// kit's buildDossier — the only writer of the dossier. Run it twice and
// the bytes must be identical: the copy is a plain recursive copy and the
// dossier is built from the staged files alone, so nothing about the run
// (time, temp paths) leaks into the output.
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.env.MAKEFUN_OUTPUT_DIR || join(here, 'out'));
const staging = await mkdtemp(join(tmpdir(), 'tidelock-'));
try {
  await cp(join(here, 'game'), join(staging, 'game'), { recursive: true });
  await cp(join(here, 'screenshots'), join(staging, 'screenshots'), { recursive: true });
  await mkdir(out, { recursive: true });
  await cp(join(staging, 'game'), join(out, 'game'), { recursive: true });
  await cp(join(staging, 'screenshots'), join(out, 'screenshots'), { recursive: true });
  // buildDossier returns the dossier as canonical JSON bytes; the program
  // writes them — the dossier is built from the staged files alone, so a
  // second run writes identical bytes.
  const dossier = buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  });
  await writeFile(join(out, 'dossier.json'), dossier);
} finally {
  await rm(staging, { recursive: true, force: true });
}
console.log(`TIDELOCK staged to ${out}`);
