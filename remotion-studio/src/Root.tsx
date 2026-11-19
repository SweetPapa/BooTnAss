import React from 'react';
import { Composition } from 'remotion';
import { CutsceneComposition, type CutsceneProps } from './CutsceneComposition';

const CUTSCENES: Array<{ id: string; durationInFrames: number; props: CutsceneProps }> = [
  {
    id: 'intro-launch',
    durationInFrames: 168, // 7.0s @ 24fps (VO 5.95s)
    props: {
      videoFile: 'video/intro-launch.mp4',
      voFile: 'vo/intro-launch.mp3',
      musicFile: 'music/level-01-neon-canyon.mp3',
      portraitFile: 'art/portrait-commander.jpg',
      speakerName: 'CMDR. VEX',
      badgeText: 'LAUNCH SEQUENCE // VANGUARD-X',
      slamTitle: 'BOOT N ASS',
      slamSubtitle: 'SECTOR 01 // NEON CANYON',
      themeColor: '#00f0ff',
      accentColor: '#ffd447',
      mode: 'hero',
      playbackRate: 1.0,
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
    durationInFrames: 152, // 6.33s @ 24fps (VO 5.71s)
    props: {
      videoFile: 'video/boss-01-aegis.mp4',
      voFile: 'vo/boss-01-aegis.mp3',
      musicFile: 'music/boss-battle.mp3',
      portraitFile: 'art/portrait-boss.jpg',
      speakerName: 'AEGIS CORE',
      badgeText: 'RED ALERT // BOSS APPROACHING',
      slamTitle: 'AEGIS DREADNOUGHT',
      slamSubtitle: 'THREAT LEVEL: EXTREME',
      themeColor: '#ff2a55',
      accentColor: '#ffd447',
      mode: 'boss',
      playbackRate: 0.78,
      subtitles: [
        { startFrame: 6, endFrame: 72, text: 'WARNING! AEGIS DREADNOUGHT ONLINE!' },
        { startFrame: 73, endFrame: 152, text: "TINY HUMAN... I'MMA PUT BOOT N ASS!!", highlight: true },
      ],
    },
  },
  {
    id: 'boss-02-sentinel',
    durationInFrames: 120, // 5.0s @ 24fps (VO 3.74s)
    props: {
      videoFile: 'video/boss-02-sentinel.mp4',
      voFile: 'vo/boss-02-sentinel.mp3',
      musicFile: 'music/boss-battle.mp3',
      portraitFile: 'art/portrait-boss.jpg',
      speakerName: 'OCTA-CORE',
      badgeText: 'RED ALERT // BOSS APPROACHING',
      slamTitle: 'OCTA-CORE SENTINEL',
      slamSubtitle: 'PRISM SHIELD MATRIX ACTIVE',
      themeColor: '#c84bff',
      accentColor: '#ffd447',
      mode: 'boss',
      playbackRate: 1.0,
      subtitles: [
        { startFrame: 6, endFrame: 56, text: 'PRISM SHIELDS ENGAGED! RESISTANCE IS STUPID!' },
        { startFrame: 57, endFrame: 120, text: "I'MMA PUT BOOT N ASS!!", highlight: true },
      ],
    },
  },
  {
    id: 'boss-03-leviathan',
    durationInFrames: 184, // 7.66s @ 24fps (VO 7.15s)
    props: {
      videoFile: 'video/boss-03-leviathan.mp4',
      voFile: 'vo/boss-03-leviathan.mp3',
      musicFile: 'music/boss-battle.mp3',
      portraitFile: 'art/portrait-boss.jpg',
      speakerName: 'LEVIATHAN',
      badgeText: 'FINAL BOSS // HYPER-GRID CORE',
      slamTitle: 'SOLARIS LEVIATHAN',
      slamSubtitle: 'MAXIMUM BOOT N ASS PROTOCOL',
      themeColor: '#ff4422',
      accentColor: '#ffd447',
      mode: 'boss',
      playbackRate: 0.78,
      subtitles: [
        { startFrame: 6, endFrame: 66, text: 'SOLARIS LEVIATHAN AWAKENS!' },
        { startFrame: 67, endFrame: 118, text: 'FINAL WARNING, MEATBAG—' },
        { startFrame: 119, endFrame: 184, text: 'PREPARE FOR MAXIMUM BOOT N ASS!!', highlight: true },
      ],
    },
  },
  {
    id: 'victory-ending',
    durationInFrames: 192, // 8.0s @ 24fps (VO 6.22s)
    props: {
      videoFile: 'video/victory-ending.mp4',
      voFile: 'vo/victory-ending.mp3',
      musicFile: 'music/victory-fanfare.mp3',
      portraitFile: 'art/portrait-commander.jpg',
      speakerName: 'CMDR. VEX',
      badgeText: 'MISSION ACCOMPLISHED // GALAXY SAVED',
      slamTitle: 'FRONTIER LIBERATED',
      slamSubtitle: 'CERTIFIED GALACTIC LEGEND',
      themeColor: '#ffd447',
      accentColor: '#00f0ff',
      mode: 'victory',
      playbackRate: 1.0,
      subtitles: [
        { startFrame: 6, endFrame: 46, text: 'BOOM!! WE DID IT!!', highlight: true },
        { startFrame: 47, endFrame: 114, text: "YOU PUT BOOT IN THE ENTIRE ARMADA'S ASS!!" },
        { startFrame: 115, endFrame: 192, text: 'FIRST ROUND OF SPACE TACOS IS ON ME, LEGEND!', highlight: true },
      ],
    },
  },
  {
    id: 'gameover-eject',
    durationInFrames: 174, // 7.25s @ 24fps (VO 6.77s)
    props: {
      videoFile: 'video/gameover-eject.mp4',
      voFile: 'vo/gameover-eject.mp3',
      musicFile: 'music/boss-battle.mp3',
      portraitFile: 'art/portrait-boss.jpg',
      speakerName: 'WARLORD AI',
      badgeText: 'SIGNAL LOST // HULL DESTROYED',
      slamTitle: 'BOOT IN ASS!!',
      slamSubtitle: 'VANGUARD-X DESTROYED',
      themeColor: '#ff2244',
      accentColor: '#ffd447',
      mode: 'gameover',
      playbackRate: 0.68,
      subtitles: [
        { startFrame: 6, endFrame: 62, text: 'HA HA HA HA! MISSION COMPLETE!' },
        { startFrame: 63, endFrame: 118, text: 'I PUT BOOT N ASS!!', highlight: true },
        { startFrame: 119, endFrame: 174, text: 'BETTER LUCK NEXT TIME, ROOKIE!' },
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
