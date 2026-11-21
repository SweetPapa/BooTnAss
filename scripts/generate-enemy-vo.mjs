#!/usr/bin/env node
/**
 * Generates hilarious radio voice clips for Tailgater Aces & wacky new enemies
 * (Giant Boot Ship, Triangle of Doom, Cyber-Centipede) via WARLOCK Kokoro TTS + ffmpeg.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const VO_DIR = path.resolve('public/assets/vo');
fs.mkdirSync(VO_DIR, { recursive: true });
const KOKORO_URL = process.env.KOKORO_URL || 'http://192.168.1.151:8083/v1/audio/speech';

const LINES = [
  {
    id: 'tailgater-lock-1',
    voice: 'af_sky',
    fx: 'radio',
    text: "Bogey glued to your six! Hit the airbrakes or pull a somersault backflip to flip right behind him!",
  },
  {
    id: 'tailgater-lock-2',
    voice: 'am_adam',
    fx: 'radio',
    text: "Watch your tailpipe, ace! That rival stalker won't shake loose—somersault or brake to make him overshoot!",
  },
  {
    id: 'tailgater-taunt-1',
    voice: 'bm_fable',
    fx: 'rival',
    text: "Locked right on your tail, human! You can't shake me—say goodbye to your rear bumper!",
  },
  {
    id: 'tailgater-reversed-1',
    voice: 'bm_fable',
    fx: 'rival_panic',
    text: "WHOA! WAIT A SECOND! HE PULLED A BACKFLIP?! MY TARGETING SYSTEM IS COOKED!",
  },
  {
    id: 'tailgater-reversed-2',
    voice: 'bm_fable',
    fx: 'rival_panic',
    text: "AAAH! HE SLAMMED THE BRAKES! I OVERSHOT—DON'T SHOOT MY SHINY THRUSTERS!",
  },
  {
    id: 'enemy-boot-1',
    voice: 'af_sky',
    fx: 'radio',
    text: "Uh... is that a giant flying space boot?! Watch out for the heel rockets and blast those laces!",
  },
  {
    id: 'enemy-triangle-1',
    voice: 'am_adam',
    fx: 'radio',
    text: "Flying triangle of doom dead ahead! That creepy giant eye is staring right at us—shoot it!",
  },
  {
    id: 'enemy-centipede-1',
    voice: 'af_sky',
    fx: 'radio',
    text: "Ewww! Cyber-centipede slithering across the canyon! Blast that wiggly metal nightmare!",
  },
];

function getFilter(fx) {
  if (fx === 'rival') {
    return 'asetrate=24000*0.92,aresample=24000,highpass=f=220,lowpass=f=3400,acrusher=bits=10:mode=log:aa=1,volume=1.3';
  }
  if (fx === 'rival_panic') {
    return 'asetrate=24000*1.04,aresample=24000,highpass=f=260,lowpass=f=3600,acrusher=bits=9:mode=log:aa=1,volume=1.32';
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
        speed: 1.06,
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
