#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const OUT_DIR = path.resolve('../public/assets/video');
const IDS = [
  'intro-launch',
  'boss-01-aegis',
  'boss-02-sentinel',
  'boss-03-leviathan',
  'victory-ending',
  'gameover-eject',
];

for (const id of IDS) {
  const outFile = path.join(OUT_DIR, `${id}.mp4`);
  console.log(`\n[REMOTION] Rendering ${id} -> ${outFile}`);
  execFileSync(
    'npx',
    [
      'remotion',
      'render',
      'src/index.ts',
      id,
      outFile,
      '--codec=h264',
      '--crf=20',
      '--overwrite',
    ],
    { stdio: 'inherit' }
  );
}
console.log('\n[DONE] All 6 Remotion cutscenes rendered!');
