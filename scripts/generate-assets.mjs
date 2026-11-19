#!/usr/bin/env node
/**
 * Generates funny, intense, ZERO-cringe action-comedy voiceovers + robotic boss
 * "I'MMA PUT BOOT N ASS!" screams + new short intense crawl narration via WARLOCK Kokoro TTS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const VO_DIR = path.resolve('public/assets/vo');
fs.mkdirSync(VO_DIR, { recursive: true });

const KOKORO_URL = process.env.KOKORO_URL || 'http://192.168.1.151:8083/v1/audio/speech';

const VOICE_LINES = [
  // New short intense funny opening crawl narration
  {
    id: 'crawl-narration',
    voice: 'bm_george',
    text: "Emergency broadcast! Boot N Ass: Galactic Red Alert! The aliens are here, and they did not come in peace. An armada of trash-talking space robots has invaded the Neon Frontier with one terrifying mission: to put boot in ass across every star system. The entire Starfleet already ran away. Now only one pilot, one prototype starfighter, and a ridiculous amount of lasers stand between humanity and a galactic ass-kicking. Lock on. Barrel roll. Put boot in their ass first!",
  },

  // Mission Start (5) — intense, funny, zero cringe
  { id: 'mission-start-1', voice: 'am_adam', text: "Alright rookie, the aliens came to put boot in ass. Let's return the favor!" },
  { id: 'mission-start-2', voice: 'af_nova', text: "All thrusters locked! Try not to fly into a giant rock in the first ten seconds!" },
  { id: 'mission-start-3', voice: 'am_adam', text: "Zero insurance on this starfighter and the galaxy's counting on you. Punch it!" },
  { id: 'mission-start-4', voice: 'af_nova', text: "Hostiles ahead! Keep your eyes open, dodge the red stuff, and blast everything that moves!" },
  { id: 'mission-start-5', voice: 'am_adam', text: "Welcome to the Neon Frontier! Time to chew bubblegum and kick alien ass—and we're all out of gum!" },

  // Kill Streak / High Action (5)
  { id: 'streak-1', voice: 'af_nova', text: "Boom! That whole squadron just got deleted! Keep tearing 'em up!" },
  { id: 'streak-2', voice: 'am_adam', text: "Sweet mother of lasers! You're shredding 'em like cheap cardboard!" },
  { id: 'streak-3', voice: 'af_nova', text: "Unbelievable shooting! They didn't even get a chance to scream!" },
  { id: 'streak-4', voice: 'am_adam', text: "Now that is what I call express delivery of boot to ass! Keep firing!" },
  { id: 'streak-5', voice: 'af_nova', text: "Clean sweep! Look at those explosions—pure arcade perfection!" },

  // Overdrive 10x (4)
  { id: 'overdrive-1', voice: 'af_nova', text: "Ten-x combo! Triple plasma overdrive online—unleash hell!" },
  { id: 'overdrive-2', voice: 'am_adam', text: "Overdrive unlocked! Whip out the triple cannons and light up the sky!" },
  { id: 'overdrive-3', voice: 'af_nova', text: "Ten-x multiplier! Weapons at maximum power—melt their faces off!" },
  { id: 'overdrive-4', voice: 'am_adam', text: "Maximum overdrive! You are officially a certified one-man armada!" },

  // Barrel Roll Deflect (5)
  { id: 'barrel-roll-1', voice: 'af_nova', text: "Nice barrel roll! You slapped that plasma right back in their face!" },
  { id: 'barrel-roll-2', voice: 'am_adam', text: "Do a barrel roll! Return to sender, alien scum!" },
  { id: 'barrel-roll-3', voice: 'af_nova', text: "Textbook deflection! They're literally shooting themselves now!" },
  { id: 'barrel-roll-4', voice: 'am_adam', text: "Ha! Bounced that laser right back down their exhaust pipe!" },
  { id: 'barrel-roll-5', voice: 'af_nova', text: "Clean spin! Not a scratch on the paint!" },

  // Player Hit (5)
  { id: 'player-hit-1', voice: 'am_adam', text: "Ow! Quit eating rocks with your face, rookie! Use your thrusters!" },
  { id: 'player-hit-2', voice: 'af_nova', text: "Whoa, watch it! The glowing red things are bad—steer around 'em!" },
  { id: 'player-hit-3', voice: 'am_adam', text: "Hey! That hull paint cost more than your salary! Steer the ship!" },
  { id: 'player-hit-4', voice: 'af_nova', text: "Ouch! Did you just headbutt a laser beam? That's not how you dodge!" },
  { id: 'player-hit-5', voice: 'am_adam', text: "My grandma flies smoother than that and she only drove a golf cart!" },

  // Boost Ring / Slalom Gate (4)
  { id: 'ring-pickup-1', voice: 'af_nova', text: "Right through the gate! Shields up, turbo engaged!" },
  { id: 'ring-pickup-2', voice: 'am_adam', text: "Threaded the needle like a pro! Hit the gas and hug those turns!" },
  { id: 'ring-pickup-3', voice: 'af_nova', text: "Turbo boost online! Now that's some serious space racing!" },
  { id: 'ring-pickup-4', voice: 'am_adam', text: "Pure racing perfection! Burn some cosmic rubber!" },

  // Low Shield (3)
  { id: 'low-shield-1', voice: 'am_adam', text: "Your shields are thinner than cheap hotel toilet paper! Grab a gold ring!" },
  { id: 'low-shield-2', voice: 'af_nova', text: "Hull's barely holding together! Fly through a gold ring before we blow!" },
  { id: 'low-shield-3', voice: 'am_adam', text: "Red alert! One more hit and we're space confetti! Find a shield ring!" },

  // Boss Warning (2)
  { id: 'boss-warning-1', voice: 'am_adam', text: "Holy mother of god, look at the size of that metal monster! Blast its glowy bits off!" },
  { id: 'boss-warning-2', voice: 'af_nova', text: "Massive dreadnought dead ahead! Target the glowing weak points and stay sharp!" },

  // BOSS ROBOTIC SCREAM: "I'MMA PUT BOOT N ASS!" (4 robotic variants!)
  { id: 'boss-bootnass-1', voice: 'bm_george', robot: 'heavy', text: "I'MMA PUT BOOT N ASS! I'MMA PUT BOOT N ASS!" },
  { id: 'boss-bootnass-2', voice: 'am_adam', robot: 'scream', text: "WARNING! I'MMA PUT BOOT N ASS! PREPARE FOR BOOT N ASS!" },
  { id: 'boss-bootnass-3', voice: 'bm_george', robot: 'deep', text: "INITIATING MAXIMUM PAIN! I'MMA PUT BOOT N ASS!" },
  { id: 'boss-bootnass-4', voice: 'am_adam', robot: 'glitch', text: "ERROR! ERROR! I'MMA PUT BOOT N ASS RIGHT NOW!" },

  // Boss Robotic Taunts (3)
  { id: 'boss-taunt-1', voice: 'bm_george', robot: 'heavy', text: "How adorable. You brought a tiny pew-pew toy to a dreadnought fight. I'mma put boot n ass!" },
  { id: 'boss-taunt-2', voice: 'bm_george', robot: 'deep', text: "Scanning your cockpit. Massive ego, microscopic shields. I'mma put boot n ass!" },
  { id: 'boss-taunt-3', voice: 'bm_george', robot: 'scream', text: "Full laser sweep engaged! Dance for me, tiny human! I'mma put boot n ass!" },

  // Boss Phase 2 (3)
  { id: 'boss-phase2-1', voice: 'af_nova', text: "Armor shredded! Its central core is wide open—blast it to kingdom come!" },
  { id: 'boss-phase2-2', voice: 'am_adam', text: "You blew its armor right off! Shove a quad-lock missile straight into the reactor!" },
  { id: 'boss-phase2-3', voice: 'af_nova', text: "Ooh, he's furious now! Watch those sweeping beams and finish him!" },

  // Level Clear (3)
  { id: 'level-clear-1', voice: 'am_adam', text: "Boom! Smoked 'em! First round of space tacos is on me, legend!" },
  { id: 'level-clear-2', voice: 'af_nova', text: "Target obliterated! You officially put boot in that alien ass!" },
  { id: 'level-clear-3', voice: 'am_adam', text: "Sector cleared! That giant robot didn't know what hit its shiny metal ass!" },

  // Game Over (3)
  { id: 'game-over-1', voice: 'am_adam', text: "Well crap, that's coming out of your paycheck. Rebuilding the ship now!" },
  { id: 'game-over-2', voice: 'af_nova', text: "Blown to space dust! Shake it off, pilot, and get back in there!" },
  { id: 'game-over-3', voice: 'bm_george', robot: 'deep', text: "MISSION COMPLETE. I PUT BOOT N ASS. TRY AGAIN, HUMAN." },
];

function getRobotFilter(mode) {
  if (mode === 'heavy') {
    return 'asetrate=24000*0.84,aresample=24000,flanger=delay=4:depth=3:regen=65:speed=6,acrusher=bits=7:mode=log:aa=1,aecho=0.8:0.7:35:0.45,volume=1.35';
  }
  if (mode === 'scream') {
    return 'asetrate=24000*1.08,aresample=24000,flanger=delay=2:depth=4:regen=75:speed=9,acrusher=bits=6:mode=log:aa=1,aecho=0.8:0.6:28:0.4,volume=1.4';
  }
  if (mode === 'deep') {
    return 'asetrate=24000*0.76,aresample=24000,flanger=delay=6:depth=3:regen=60:speed=4,acrusher=bits=7:mode=log:aa=1,aecho=0.8:0.75:45:0.5,volume=1.4';
  }
  if (mode === 'glitch') {
    return 'asetrate=24000*0.95,aresample=24000,flanger=delay=3:depth=5:regen=80:speed=9.5,acrusher=bits=5:mode=log:aa=1,aecho=0.8:0.65:22:0.45,volume=1.4';
  }
  return null;
}

async function generateVoiceOvers() {
  console.log(`[VO] Generating ${VOICE_LINES.length} crisp action-comedy voice lines on WARLOCK...`);
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

      const af = item.robot ? getRobotFilter(item.robot) : null;
      const args = af
        ? ['-y', '-i', wavPath, '-af', af, '-codec:a', 'libmp3lame', '-q:a', '4', mp3Path]
        : ['-y', '-i', wavPath, '-codec:a', 'libmp3lame', '-q:a', '4', mp3Path];

      execFileSync('ffmpeg', args, { stdio: 'ignore' });
      fs.unlinkSync(wavPath);
      console.log(`[VO] ${item.id}.mp3${item.robot ? ` [ROBOT:${item.robot}]` : ''}`);
    } catch (err) {
      console.error(`[VO] Failed ${item.id}:`, err.message);
    }
  }
  console.log('[DONE] All voiceovers ready!');
}

await generateVoiceOvers();
