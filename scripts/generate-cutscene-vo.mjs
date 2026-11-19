#!/usr/bin/env node
/**
 * Generates 6 hilarious over-the-top cutscene voiceovers via WARLOCK Kokoro TTS
 * with robotic ffmpeg DSP for the boss & game-over scenes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT_DIR = path.resolve('remotion-studio/public/vo');
fs.mkdirSync(OUT_DIR, { recursive: true });

const KOKORO_URL = process.env.KOKORO_URL || 'http://192.168.1.151:8083/v1/audio/speech';

const CUTSCENE_VOS = [
  {
    id: 'intro-launch',
    voice: 'am_adam',
    text: "All systems hot! The aliens came to put boot in ass, so punch the thrusters and put boot in their ass first! Let's roll!",
  },
  {
    id: 'boss-01-aegis',
    voice: 'bm_george',
    robot: 'heavy',
    text: "WARNING! Aegis Dreadnought online! Tiny human, I'mma put boot n ass!",
  },
  {
    id: 'boss-02-sentinel',
    voice: 'am_adam',
    robot: 'scream',
    text: "Prism shields engaged! Resistance is stupid! I'mma put boot n ass!",
  },
  {
    id: 'boss-03-leviathan',
    voice: 'bm_george',
    robot: 'deep',
    text: "Solaris Leviathan awakens! Final warning, meatbag—prepare for maximum boot n ass!",
  },
  {
    id: 'victory-ending',
    voice: 'am_adam',
    text: "BOOM! We did it! You just put boot in the entire alien armada's ass! First round of space tacos is on me, legend!",
  },
  {
    id: 'gameover-eject',
    voice: 'bm_george',
    robot: 'heavy',
    text: "Ha ha ha ha! Mission complete! I put boot n ass! Better luck next time, rookie!",
  },
];

function getRobotFilter(mode) {
  if (mode === 'heavy') {
    return 'asetrate=24000*0.84,aresample=24000,flanger=delay=4:depth=3:regen=65:speed=6,acrusher=bits=7:mode=log:aa=1,aecho=0.8:0.7:35:0.45,volume=1.45';
  }
  if (mode === 'scream') {
    return 'asetrate=24000*1.06,aresample=24000,flanger=delay=2:depth=4:regen=75:speed=9,acrusher=bits=6:mode=log:aa=1,aecho=0.8:0.6:28:0.4,volume=1.45';
  }
  return 'asetrate=24000*0.76,aresample=24000,flanger=delay=6:depth=3:regen=60:speed=4,acrusher=bits=7:mode=log:aa=1,aecho=0.8:0.75:45:0.5,volume=1.45';
}

for (const item of CUTSCENE_VOS) {
  const wavPath = path.join(OUT_DIR, `${item.id}.wav`);
  const mp3Path = path.join(OUT_DIR, `${item.id}.mp3`);
  const res = await fetch(KOKORO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'kokoro',
      input: item.text,
      voice: item.voice,
      response_format: 'wav',
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  fs.writeFileSync(wavPath, Buffer.from(await res.arrayBuffer()));
  const af = item.robot ? getRobotFilter(item.robot) : 'highpass=f=240,lowpass=f=4200,volume=1.35';
  execFileSync('ffmpeg', ['-y', '-i', wavPath, '-af', af, '-codec:a', 'libmp3lame', '-b:a', '192k', mp3Path], {
    stdio: 'ignore',
  });
  fs.unlinkSync(wavPath);
  const dur = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', mp3Path],
    { encoding: 'utf8' }
  ).trim();
  console.log(`[CUTSCENE VO] ${item.id}.mp3 -> ${dur}s`);
}
