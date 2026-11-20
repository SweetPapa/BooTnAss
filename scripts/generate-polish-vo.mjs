#!/usr/bin/env node
/**
 * Generates hilarious polish voiceovers via WARLOCK Kokoro TTS + ffmpeg FX:
 * - Pilot death screams ("MAYDAY! NOOOOOOOO!") with spinning cockpit radio distortion
 * - Boss chain-reaction meltdown screams ("MY METAL ASS! NOOOOOOO!")
 * - Panicking Alien Grunt cameos
 * - Zorp mid-boss supply drop callouts
 * - Nova Smart Bomb hype lines
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const VO_DIR = path.resolve('public/assets/vo');
fs.mkdirSync(VO_DIR, { recursive: true });

const KOKORO_URL = process.env.KOKORO_URL || 'http://192.168.1.151:8083/v1/audio/speech';

const NEW_LINES = [
  // Pilot Death Screams (4) — dramatic spinning-out cockpit radio FX!
  {
    id: 'pilot-death-1',
    voice: 'am_adam',
    fx: 'mayday',
    text: "Mayday! Mayday! I'm going down! Nooooooooo! Tell my mom I beat my high score!",
  },
  {
    id: 'pilot-death-2',
    voice: 'af_nova',
    fx: 'mayday',
    text: "Whoa whoa whoa, I'm spinning out! Nooooooooo! Not my space tacos!",
  },
  {
    id: 'pilot-death-3',
    voice: 'am_adam',
    fx: 'mayday',
    text: "Critical failure! Eject! Eject! Why is the eject button stuck?! Nooooooooo!",
  },
  {
    id: 'pilot-death-4',
    voice: 'am_adam',
    fx: 'mayday',
    text: "Oh crap! Both engines are on fire! Nooooooooo! I just waxed this starfighter!",
  },

  // Boss Meltdown Death Screams (3) — robotic exploding panic!
  {
    id: 'boss-death-1',
    voice: 'bm_george',
    fx: 'boss_meltdown',
    text: "System failure! My shiny metal ass! You actually put boot in my ass! Nooooooooo!",
  },
  {
    id: 'boss-death-2',
    voice: 'am_adam',
    fx: 'boss_meltdown',
    text: "Critical meltdown! Impossible! Tell the alien emperor I tried! Nooooooooo!",
  },
  {
    id: 'boss-death-3',
    voice: 'bm_george',
    fx: 'boss_meltdown',
    text: "Error four oh four! Ass kicked beyond repair! Self destructing! Nooooooooo!",
  },

  // Panicking Alien Grunt Cameos (3) — high-pitched alien synth pitch shift!
  {
    id: 'grunt-panic-1',
    voice: 'am_adam',
    fx: 'grunt',
    text: "Wait a second! He just blew the boss's armor off! We are all gonna die!",
  },
  {
    id: 'grunt-panic-2',
    voice: 'am_adam',
    fx: 'grunt',
    text: "Who hired this crazy human?! Run for the escape pods!",
  },
  {
    id: 'grunt-panic-3',
    voice: 'am_adam',
    fx: 'grunt',
    text: "He's bouncing our own lasers back at us! I quit! I'm going back to space college!",
  },

  // Zorp Tactical Supply Drop Callouts (3) — quirky radio mechanic!
  {
    id: 'zorp-supply-1',
    voice: 'bm_george',
    fx: 'mechanic',
    text: "Zorp Express delivery! Catch that glowing shield ring before the boss eats you!",
  },
  {
    id: 'zorp-supply-2',
    voice: 'bm_george',
    fx: 'mechanic',
    text: "Incoming care package! Fresh weapon crate coming down the lane—grab it!",
  },
  {
    id: 'zorp-supply-3',
    voice: 'bm_george',
    fx: 'mechanic',
    text: "Look alive, hotshot! Tossed you some shiny boss-busting upgrades!",
  },

  // Nova Smart Bomb Hype (2)
  {
    id: 'nova-bomb-1',
    voice: 'af_nova',
    fx: 'none',
    text: "Nova bomb away! Say goodnight, space clowns!",
  },
  {
    id: 'nova-bomb-2',
    voice: 'am_adam',
    fx: 'none',
    text: "Clearing the whole dang screen! Taste pure neon sunshine, losers!",
  },
];

function getFilter(fx) {
  if (fx === 'mayday') {
    // Urgent cockpit radio overdrive + dramatic echo tail for the "NOOOOOOO!"
    return 'highpass=f=280,lowpass=f=3600,acrusher=bits=8:mode=log:aa=1,aecho=0.85:0.7:55|115:0.38|0.22,volume=1.35';
  }
  if (fx === 'boss_meltdown') {
    // Glitching dying robot + deep metallic resonance + exploding echo!
    return 'asetrate=24000*0.82,aresample=24000,flanger=delay=4:depth=5:regen=75:speed=8.5,acrusher=bits=6:mode=log:aa=1,aecho=0.85:0.75:45|105:0.45|0.3,volume=1.4';
  }
  if (fx === 'grunt') {
    // Funny higher-pitched panicking alien grunt!
    return 'asetrate=24000*1.26,aresample=24000,flanger=delay=2:depth=2:regen=35:speed=5,volume=1.25';
  }
  if (fx === 'mechanic') {
    // Crisp enthusiastic Zorp pitch slightly brighter
    return 'asetrate=24000*1.12,aresample=24000,volume=1.2';
  }
  return null;
}

async function run() {
  console.log(`[POLISH VO] Generating ${NEW_LINES.length} funny polish voice clips on WARLOCK...`);
  for (const item of NEW_LINES) {
    const mp3Path = path.join(VO_DIR, `${item.id}.mp3`);
    const wavPath = path.join(VO_DIR, `${item.id}.wav`);
    try {
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

      const af = getFilter(item.fx);
      const args = af
        ? ['-y', '-i', wavPath, '-af', af, '-codec:a', 'libmp3lame', '-q:a', '4', mp3Path]
        : ['-y', '-i', wavPath, '-codec:a', 'libmp3lame', '-q:a', '4', mp3Path];

      execFileSync('ffmpeg', args, { stdio: 'ignore' });
      fs.unlinkSync(wavPath);
      console.log(`[POLISH VO] ✓ ${item.id}.mp3 [${item.fx}]`);
    } catch (err) {
      console.error(`[POLISH VO] ✗ Failed ${item.id}:`, err.message);
      process.exitCode = 1;
    }
  }
  console.log('[DONE] Polish voiceovers generated!');
}

await run();
