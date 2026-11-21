import React from 'react';
import { Composition } from 'remotion';
import { CutsceneComposition, type CutsceneProps } from './CutsceneComposition';

const CUTSCENES: Array<{ id: string; durationInFrames: number; props: CutsceneProps }> = [
  {
    id: 'intro-launch',
    durationInFrames: 168,
    props: {
      videoFile: 'video/intro-launch.mp4',
      voFile: 'vo/intro-launch.mp3',
      musicFile: 'music/level-01-neon-canyon.mp3',
      portraitFile: 'art/portrait-commander.jpg',
      speakerName: 'CMDR. VEX',
      badgeText: 'LAUNCH SEQUENCE // VANGUARD-X',
      slamTitle: 'BOOT N ASS',
      slamSubtitle: 'SECTOR 01 // NEON CANYON',
      impactStamp: 'THRUSTERS: 9000%',
      telemetryText: 'MACH 12.4 // SHIELDS 100% // BOOT ENGAGED',
      themeColor: '#00f0ff',
      accentColor: '#ffd447',
      mode: 'hero',
      playbackRate: 1.0,
      cameo: {
        portraitFile: 'art/portrait-wingman.jpg',
        label: 'ACE NOVA // WING 2',
        bubbleText: "LET'S GOOO!!",
        startFrame: 68,
        endFrame: 158,
      },
      subtitles: [
        { startFrame: 6, endFrame: 38, text: 'ALL SYSTEMS HOT!' },
        { startFrame: 39, endFrame: 88, text: 'THE ALIENS CAME TO PUT BOOT IN ASS...' },
        { startFrame: 89, endFrame: 136, text: 'PUT BOOT IN THEIR ASS FIRST!!', highlight: true },
        { startFrame: 137, endFrame: 168, text: "LET'S ROLL!!", highlight: true },
      ],
    },
  },
  {
    id: 'boss-01-aegis',
    // VO = 5.712s + 0.25s lead-in + 1.04s tail => 7.0s (168 frames @ 24fps) so villain voiceover NEVER cuts off!
    durationInFrames: 168,
    props: {
      videoFile: 'video/boss-01-aegis.mp4',
      voFile: 'vo/boss-01-aegis.mp3',
      musicFile: 'music/boss-battle.mp3',
      portraitFile: 'art/portrait-boss.jpg',
      speakerName: 'AEGIS CORE',
      badgeText: 'RED ALERT // BOSS APPROACHING',
      slamTitle: 'AEGIS DREADNOUGHT',
      slamSubtitle: 'THREAT LEVEL: EXTREME',
      impactStamp: 'BOOT ALERT: MAX',
      telemetryText: 'DANGER // WING TURRETS // SINGULARITY CORE',
      themeColor: '#ff2a55',
      accentColor: '#ffd447',
      mode: 'boss',
      playbackRate: 0.71,
      cameo: {
        portraitFile: 'art/portrait-wingman.jpg',
        label: 'ACE NOVA // PANIC',
        bubbleText: 'OH CRAP, IT HUGE!!',
        startFrame: 66,
        endFrame: 158,
      },
      subtitles: [
        { startFrame: 6, endFrame: 76, text: 'WARNING! AEGIS DREADNOUGHT ONLINE!' },
        { startFrame: 77, endFrame: 164, text: "TINY HUMAN... I'MMA PUT BOOT N ASS!!", highlight: true },
      ],
    },
  },
  {
    id: 'boss-02-sentinel',
    // VO = 3.744s + 0.25s lead-in + 1.34s tail => 5.33s (128 frames @ 24fps)
    durationInFrames: 128,
    props: {
      videoFile: 'video/boss-02-sentinel.mp4',
      voFile: 'vo/boss-02-sentinel.mp3',
      musicFile: 'music/boss-battle.mp3',
      portraitFile: 'art/portrait-boss.jpg',
      speakerName: 'OCTA-CORE',
      badgeText: 'RED ALERT // BOSS APPROACHING',
      slamTitle: 'OCTA-CORE SENTINEL',
      slamSubtitle: 'PRISM SHIELD MATRIX ACTIVE',
      impactStamp: 'SHIELD ORBIT: 4X',
      telemetryText: 'WARNING // PRISM MATRIX // LASER CURTAIN',
      themeColor: '#c84bff',
      accentColor: '#ffd447',
      mode: 'boss',
      playbackRate: 0.93,
      cameo: {
        portraitFile: 'art/portrait-shop.jpg',
        label: 'ZORP // MECHANIC',
        bubbleText: 'SHOOT THE GAPS!!',
        startFrame: 54,
        endFrame: 120,
      },
      subtitles: [
        { startFrame: 6, endFrame: 62, text: 'PRISM SHIELDS ENGAGED! RESISTANCE IS STUPID!' },
        { startFrame: 63, endFrame: 124, text: "I'MMA PUT BOOT N ASS!!", highlight: true },
      ],
    },
  },
  {
    id: 'boss-03-leviathan',
    // VO = 7.152s + 0.25s lead-in + 1.10s tail => 8.5s (204 frames @ 24fps)
    durationInFrames: 204,
    props: {
      videoFile: 'video/boss-03-leviathan.mp4',
      voFile: 'vo/boss-03-leviathan.mp3',
      musicFile: 'music/boss-battle.mp3',
      portraitFile: 'art/portrait-boss.jpg',
      speakerName: 'LEVIATHAN',
      badgeText: 'FINAL BOSS // HYPER-GRID CORE',
      slamTitle: 'SOLARIS LEVIATHAN',
      slamSubtitle: 'MAXIMUM BOOT N ASS PROTOCOL',
      impactStamp: 'FINAL SHOWDOWN!',
      telemetryText: 'OMEGA CLASS // 7-SEGMENT SERPENT // NO MERCY',
      themeColor: '#ff4422',
      accentColor: '#ffd447',
      mode: 'boss',
      playbackRate: 0.7,
      cameo: {
        portraitFile: 'art/portrait-commander.jpg',
        label: 'CMDR. VEX // LIVE',
        bubbleText: 'FINISH THIS THING!!',
        startFrame: 76,
        endFrame: 192,
      },
      subtitles: [
        { startFrame: 6, endFrame: 68, text: 'SOLARIS LEVIATHAN AWAKENS!' },
        { startFrame: 69, endFrame: 124, text: 'FINAL WARNING, MEATBAG—' },
        { startFrame: 125, endFrame: 200, text: 'PREPARE FOR MAXIMUM BOOT N ASS!!', highlight: true },
      ],
    },
  },
  {
    id: 'victory-ending',
    durationInFrames: 192,
    props: {
      videoFile: 'video/victory-ending.mp4',
      voFile: 'vo/victory-ending.mp3',
      musicFile: 'music/victory-fanfare.mp3',
      portraitFile: 'art/portrait-commander.jpg',
      speakerName: 'CMDR. VEX',
      badgeText: 'MISSION ACCOMPLISHED // GALAXY SAVED',
      slamTitle: 'FRONTIER LIBERATED',
      slamSubtitle: 'CERTIFIED GALACTIC LEGEND',
      impactStamp: 'SPACE TACO TIME!',
      telemetryText: 'ARMADA: SMOKED // STATUS: LEGENDARY',
      themeColor: '#ffd447',
      accentColor: '#00f0ff',
      mode: 'victory',
      playbackRate: 1.0,
      cameo: {
        portraitFile: 'art/portrait-grunt.jpg',
        label: 'ALIEN GRUNT // FLEEING',
        bubbleText: 'AAAH! MY BOOT!!',
        startFrame: 64,
        endFrame: 178,
      },
      subtitles: [
        { startFrame: 6, endFrame: 46, text: 'BOOM!! WE DID IT!!', highlight: true },
        { startFrame: 47, endFrame: 114, text: "YOU PUT BOOT IN THE ENTIRE ARMADA'S ASS!!" },
        { startFrame: 115, endFrame: 192, text: 'FIRST ROUND OF SPACE TACOS IS ON ME, LEGEND!', highlight: true },
      ],
    },
  },
  {
    id: 'gameover-eject',
    // VO = 6.768s + 0.25s lead-in + 0.98s tail => 8.0s (192 frames @ 24fps)
    durationInFrames: 192,
    props: {
      videoFile: 'video/gameover-eject.mp4',
      voFile: 'vo/gameover-eject.mp3',
      musicFile: 'music/boss-battle.mp3',
      portraitFile: 'art/portrait-boss.jpg',
      speakerName: 'WARLORD AI',
      badgeText: 'SIGNAL LOST // HULL DESTROYED',
      slamTitle: 'BOOT IN ASS!!',
      slamSubtitle: 'VANGUARD-X DESTROYED',
      impactStamp: 'OOF! REKT!',
      telemetryText: 'EJECT POD DEPLOYED // CHECKPOINT SAVED',
      themeColor: '#ff2244',
      accentColor: '#ffd447',
      mode: 'gameover',
      playbackRate: 0.62,
      cameo: {
        portraitFile: 'art/portrait-grunt.jpg',
        label: 'ALIEN GRUNT // LOL',
        bubbleText: 'GET REKT HUMAN!',
        startFrame: 62,
        endFrame: 180,
      },
      subtitles: [
        { startFrame: 6, endFrame: 66, text: 'HA HA HA HA! MISSION COMPLETE!' },
        { startFrame: 67, endFrame: 126, text: 'I PUT BOOT N ASS!!', highlight: true },
        { startFrame: 127, endFrame: 188, text: 'BETTER LUCK NEXT TIME, ROOKIE!' },
      ],
    },
  },
];

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {CUTSCENES.map((c) => (
        <Composition
          key={c.id}
          id={c.id}
          component={CutsceneComposition}
          durationInFrames={c.durationInFrames}
          fps={24}
          width={1280}
          height={720}
          defaultProps={c.props}
        />
      ))}
    </>
  );
};
