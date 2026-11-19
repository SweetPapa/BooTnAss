#!/usr/bin/env node
/**
 * Generates funny, wacky arcade character & enemy radio portraits on WARLOCK Qwen-Image 2.1 UC
 * (http://192.168.1.151:8188/v1/images/generations).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ART_DIR = path.resolve('public/assets/art');
fs.mkdirSync(ART_DIR, { recursive: true });

const COMFY_URL = process.env.COMFY_URL || 'http://192.168.1.151:8188/v1/images/generations';

const AVATARS = [
  {
    id: 'portrait-commander',
    prompt:
      'Funny wacky stylized 90s arcade cartoon portrait of an over-the-top gruff space fleet commander with a massive ridiculous handlebar mustache, oversized glowing cyan sci-fi visor goggles, shouting into a radio headset while holding a steaming coffee mug, neon synthwave cockpit background, bold expressive comic art style, hilarious, vibrant colors, centered bust, no text',
  },
  {
    id: 'portrait-wingman',
    prompt:
      'Funny wacky stylized 90s arcade cartoon portrait of a hyper-caffeinated rookie space fighter pilot with wild spiky hair, giant crooked aviator goggles glowing cyan, huge goofy confident grin, giving a thumbs up in a neon starfighter cockpit, bold Saturday morning cartoon meets Star Fox art style, vibrant colors, centered bust, no text',
  },
  {
    id: 'portrait-boss',
    prompt:
      'Hilarious menacing wacky cartoon villain portrait of a furious evil retro robot warlord shaped like a giant chrome armored skull with glowing angry red laser eyes, exaggerated spiky metal eyebrows, smoking exhaust pipes on its head, crackling red neon lightning in background, bold 90s arcade comic illustration style, centered bust, no text',
  },
  {
    id: 'portrait-grunt',
    prompt:
      'Funny wacky cartoon portrait of a goofy bug-eyed lime-green alien space trooper wearing an oversized crooked metal space helmet, panicking with wide startled eyes inside a glowing red alien cockpit, bold 90s arcade comic art style, vibrant neon rim light, centered bust, no text',
  },
  {
    id: 'portrait-shop',
    prompt:
      'Funny wacky cartoon portrait of a cheerful four-eyed purple alien cyber-mechanic wearing a grease-stained neon jumpsuit and glowing welding goggles, holding a ridiculously huge glowing golden plasma wrench, bold 90s arcade comic illustration style, dark space workshop background, centered bust, no text',
  },
];

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
    console.log(`[AVATAR] Generated ${item.id}.jpg in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error(`[AVATAR] Failed ${item.id}:`, err.message);
  }
}
console.log('[DONE] All wacky avatars generated!');
