#!/usr/bin/env node
/**
 * Generates high-energy arcade announcer stingers and extra banter clips
 * via WARLOCK Kokoro TTS + ffmpeg for the Super-Polish Pass.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const VO_DIR = path.resolve('public/assets/vo');
fs.mkdirSync(VO_DIR, { recursive: true });
const KOKORO_URL = process.env.KOKORO_URL || 'http://192.168.1.151:8083/v1/audio/speech';

const LINES = [
  {
    id: 'enemy-saucer-1',
    voice: 'af_sky',
    fx: 'radio',
    text: "Whoa, disco flying saucer! Barrel-roll their lasers right back into their dome!",
  },
  {
    id: 'stunt-loop-1',
    voice: 'am_michael',
    fx: 'blitz',
    text: "Woooohooo! Full three-sixty loop! Hold onto your space tacos!",
  },
  {
    id: 'stunt-corkscrew-1',
    voice: 'af_sky',
    fx: 'radio',
    text: "Gravity corkscrew engaged! Pure neon arcade magic—punch it!",
  },
  {
    id: 'turbo-chain-1',
    voice: 'am_adam',
    fx: 'radio',
    text: "Massive turbo chain! We are officially breaking the speed of fun!",
  },
  {
    id: 'boss-retry-1',
    voice: 'am_adam',
    fx: 'radio',
    text: "Alright, round two! Show that oversized space toaster who runs this galaxy!",
  },
  {
    id: 'weapon-pickup-1',
    voice: 'am_fenrir',
    fx: 'zorp',
    text: "Oh baby! Firepower maxed out—light 'em up like the Fourth of July!",
  },
  {
    id: 'announcer-triple',
    voice: 'am_adam',
    fx: 'announcer',
    text: "Triple kill!",
  },
  {
    id: 'announcer-quad',
    voice: 'am_adam',
    fx: 'announcer',
    text: "Quad kill!",
  },
  {
    id: 'announcer-mega',
    voice: 'am_adam',
    fx: 'announcer',
    text: "Mega kill!!",
  },
  {
    id: 'announcer-rampage',
    voice: 'am_adam',
    fx: 'announcer',
    text: "Boot n Ass Rampage!!",
  },
];

function getFilter(fx) {
  if (fx === 'announcer') {
    return 'asetrate=24000*0.92,aresample=24000,aecho=0.8:0.7:55:0.32,equalizer=f=120:width_type=o:width=1:g=4,volume=1.35';
  }
  if (fx === 'blitz') {
    return 'asetrate=24000*1.08,aresample=24000,highpass=f=280,lowpass=f=3800,volume=1.22';
  }
  if (fx === 'zorp') {
    return 'asetrate=24000*1.12,aresample=24000,highpass=f=240,lowpass=f=3800,volume=1.26';
  }
  return 'highpass=f=260,lowpass=f=3600,volume=1.22';
}

async function main() {
  for (const line of LINES) {
    const outPath = path.join(VO_DIR, `${line.id}.mp3`);
    const tmpWav = `/tmp/${line.id}.wav`;
    const res = await fetch(KOKORO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'kokoro',
        input: line.text,
        voice: line.voice,
        response_format: 'wav',
        speed: line.fx === 'announcer' ? 1.12 : 1.06,
      }),
    });
    if (!res.ok) throw new Error(`Kokoro HTTP ${res.status} for ${line.id}`);
    fs.writeFileSync(tmpWav, Buffer.from(await res.arrayBuffer()));
    execFileSync(
      'ffmpeg',
      ['-y', '-i', tmpWav, '-af', getFilter(line.fx), '-c:a', 'libmp3lame', '-b:a', '128k', outPath],
      { stdio: 'ignore' }
    );
    fs.unlinkSync(tmpWav);
    console.log(`Generated ${line.id}.mp3 (${fs.statSync(outPath).size} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
