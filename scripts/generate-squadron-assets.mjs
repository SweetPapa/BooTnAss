#!/usr/bin/env node
/**
 * Generates Wingman Squadron portraits (WARLOCK Qwen-Image 2.1 UC) and
 * 17 hilarious allied pilot voice lines (WARLOCK Kokoro TTS + ffmpeg).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ART_DIR = path.resolve('public/assets/art');
const VO_DIR = path.resolve('public/assets/vo');
fs.mkdirSync(ART_DIR, { recursive: true });
fs.mkdirSync(VO_DIR, { recursive: true });

const COMFY_URL = process.env.COMFY_URL || 'http://192.168.1.151:8188/v1/images/generations';
const KOKORO_URL = process.env.KOKORO_URL || 'http://192.168.1.151:8083/v1/audio/speech';

const AVATARS = [
  {
    id: 'portrait-blitz',
    prompt:
      'Funny wacky stylized 90s arcade cartoon portrait of a hyper-energetic daredevil space fighter pilot with wild windblown hair, glowing neon emerald-green tactical visor goggles pushed slightly crooked, cheeky thrilled grin, wearing a sleek lime-green and white flight jacket inside a glowing emerald neon starfighter cockpit, bold expressive Saturday morning arcade comic art style, vibrant neon rim light, centered bust, no text',
  },
  {
    id: 'portrait-tank',
    prompt:
      'Funny wacky stylized 90s arcade cartoon portrait of a massive grumpy heroic veteran space gunship pilot with an exaggerated square jaw, thick eyebrows, glowing golden cybernetic targeting monocle visor, chewing a toothpick with a tough smirk, wearing chunky cobalt-blue and gold armored flight gear inside a heavy bomber cockpit, bold 90s arcade comic illustration style, vibrant colors, centered bust, no text',
  },
];

const VOICE_LINES = [
  // Arrival Cutscene (Sector 2 Midpoint!)
  {
    id: 'blitz-arrive',
    voice: 'am_michael',
    fx: 'blitz',
    text: "Yo! Sorry we bailed earlier—turns out those tin cans blew up our favorite space taco stand! Blitz on your left wing!",
  },
  {
    id: 'tank-arrive',
    voice: 'bm_george',
    fx: 'tank',
    text: "Tank locked and loaded on your right! Nobody wrecks Taco Nebula and gets away with it—let's put boot in ass!",
  },

  // Sector 3 Start (Full Squadron)
  {
    id: 'squad-s3-start',
    voice: 'bm_george',
    fx: 'tank',
    text: "Full squadron locked in for the final spire! Stay on our wings, keep the bogeys off our tails, and let's end this!",
  },

  // Blitz Needs Help (Bogey on Tail!)
  {
    id: 'blitz-help-1',
    voice: 'am_michael',
    fx: 'blitz',
    text: "Uh, little help here?! Got a crazy alien glued to my tailpipe—blast him off me!",
  },
  {
    id: 'blitz-help-2',
    voice: 'am_michael',
    fx: 'blitz',
    text: "Whoa! Bogey on my six! My shields are sizzling—shoot this guy before I'm toast!",
  },

  // Tank Needs Help (Bogey on Tail!)
  {
    id: 'tank-help-1',
    voice: 'bm_george',
    fx: 'tank',
    text: "Hey hotshot, I got a pest chewing my rear armor! Peel this scrap heap off my tail!",
  },
  {
    id: 'tank-help-2',
    voice: 'bm_george',
    fx: 'tank',
    text: "Taking heavy fire on the right flank! Clear this bogey off me or I'm losing an engine!",
  },

  // Player Saved Blitz!
  {
    id: 'blitz-saved-1',
    voice: 'am_michael',
    fx: 'blitz',
    text: "Wooo! Thanks legend! Owe you a triple space burrito after this sector!",
  },
  {
    id: 'blitz-saved-2',
    voice: 'am_michael',
    fx: 'blitz',
    text: "Clean shot! Thought my wingtip was a goner—back in formation!",
  },

  // Player Saved Tank!
  {
    id: 'tank-saved-1',
    voice: 'bm_george',
    fx: 'tank',
    text: "Ha! Nice shooting, kid! Sending a little shield juice your way!",
  },
  {
    id: 'tank-saved-2',
    voice: 'bm_george',
    fx: 'tank',
    text: "Scratch one bogey! Now that's how a real wingman flies—much obliged!",
  },

  // Ally Kill Banter (used sparingly!)
  {
    id: 'blitz-kill-1',
    voice: 'am_michael',
    fx: 'blitz',
    text: "Booyah! Blitz just vaporized one! Try to keep up, ace!",
  },
  {
    id: 'blitz-kill-2',
    voice: 'am_michael',
    fx: 'blitz',
    text: "Right lane cleared! Leaving the big ugly ones for you!",
  },
  {
    id: 'tank-kill-1',
    voice: 'bm_george',
    fx: 'tank',
    text: "Heavy cannons speaking! That scrap bucket just met its maker!",
  },
  {
    id: 'tank-kill-2',
    voice: 'bm_george',
    fx: 'tank',
    text: "Boom! Tank clears the corridor—keep pushing forward!",
  },

  // Ally Ejected (Shield hit 0!)
  {
    id: 'blitz-eject',
    voice: 'am_michael',
    fx: 'mayday',
    text: "Engines fried! Ejecting! Don't worry, my escape pod has snacks—finish 'em for me!",
  },
  {
    id: 'tank-eject',
    voice: 'bm_george',
    fx: 'tank_mayday',
    text: "Hull breached! Bailing out! My ship's cooked—put extra boot in their ass for me, kid!",
  },
];

function getFilter(fx) {
  if (fx === 'blitz') {
    return 'asetrate=24000*1.08,aresample=24000,highpass=f=280,lowpass=f=3800,volume=1.22';
  }
  if (fx === 'tank') {
    return 'asetrate=24000*0.89,aresample=24000,highpass=f=180,lowpass=f=3200,volume=1.3';
  }
  if (fx === 'mayday') {
    return 'asetrate=24000*1.08,aresample=24000,highpass=f=320,lowpass=f=3400,acrusher=bits=8:mode=log:aa=1,aecho=0.8:0.65:45:0.35,volume=1.3';
  }
  if (fx === 'tank_mayday') {
    return 'asetrate=24000*0.89,aresample=24000,highpass=f=240,lowpass=f=3100,acrusher=bits=8:mode=log:aa=1,aecho=0.8:0.65:45:0.35,volume=1.35';
  }
  return null;
}

async function generateAvatars() {
  for (const item of AVATARS) {
    const pngPath = path.join(ART_DIR, `${item.id}.png`);
    const jpgPath = path.join(ART_DIR, `${item.id}.jpg`);
    try {
      const t0 = Date.now();
      const res = await fetch(COMFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen-image-2.1-uc',
          prompt: item.prompt,
          size: '512x512',
          steps: 18,
          enhance: false,
          response_format: 'b64_json',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const json = await res.json();
      const b64 = json?.data?.[0]?.b64_json;
      if (!b64) throw new Error('No b64_json');
      fs.writeFileSync(pngPath, Buffer.from(b64, 'base64'));
      execFileSync(
        'sips',
        ['-Z', '384', '-s', 'format', 'jpeg', '-s', 'formatOptions', '86', pngPath, '--out', jpgPath],
        { stdio: 'ignore' }
      );
      fs.unlinkSync(pngPath);
      console.log(`[AVATAR] ✓ ${item.id}.jpg in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error(`[AVATAR] ✗ Failed ${item.id}:`, err.message);
      process.exitCode = 1;
    }
  }
}

async function generateVO() {
  for (const item of VOICE_LINES) {
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
      console.log(`[VO] ✓ ${item.id}.mp3 [${item.fx}]`);
    } catch (err) {
      console.error(`[VO] ✗ Failed ${item.id}:`, err.message);
      process.exitCode = 1;
    }
  }
}

if (!process.argv.includes('--vo-only')) {
  await generateAvatars();
}
await generateVO();
console.log('[DONE] All squadron portraits and voice lines generated!');
