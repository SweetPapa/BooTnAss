import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export interface SubtitleCue {
  startFrame: number;
  endFrame: number;
  text: string;
  highlight?: boolean;
}

export interface CutsceneProps {
  videoFile: string;
  voFile: string;
  musicFile: string;
  portraitFile: string;
  speakerName: string;
  badgeText: string;
  slamTitle: string;
  slamSubtitle: string;
  themeColor: string;
  accentColor: string;
  mode: 'hero' | 'boss' | 'victory' | 'gameover';
  playbackRate?: number;
  subtitles: SubtitleCue[];
}

export const CutsceneComposition: React.FC<CutsceneProps> = ({
  videoFile,
  voFile,
  musicFile,
  portraitFile,
  speakerName,
  badgeText,
  slamTitle,
  slamSubtitle,
  themeColor,
  accentColor,
  mode,
  playbackRate = 1,
  subtitles,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Impact screen shake during title slam (frames 8..22) and final climax
  const slamSpring = spring({
    frame: Math.max(0, frame - 6),
    fps,
    config: { damping: 12, stiffness: 220, mass: 0.7 },
  });

  const shakeAmp =
    frame >= 8 && frame <= 20
      ? interpolate(frame, [8, 20], [14, 0], { extrapolateRight: 'clamp' })
      : mode === 'boss' && frame >= durationInFrames - 28 && frame <= durationInFrames - 10
        ? 6
        : 0;

  const shakeX = Math.sin(frame * 2.7) * shakeAmp;
  const shakeY = Math.cos(frame * 3.4) * shakeAmp;

  // Fade in / Fade out
  const fadeIn = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 10, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp' }
  );
  const masterOpacity = Math.min(fadeIn, fadeOut);

  // Red-alert strobe for boss/gameover or golden glow for victory
  const strobeOpacity =
    mode === 'boss' || mode === 'gameover'
      ? Math.max(0, Math.sin(frame * 0.45)) * 0.24
      : mode === 'victory'
        ? Math.max(0, Math.sin(frame * 0.25)) * 0.16
        : 0;

  // Title banner visibility (slams in at frame 6, holds cleanly, exits by frame 66)
  const titleExit = interpolate(frame, [52, 66], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const titleScale = interpolate(slamSpring, [0, 1], [2.4, 1.0]);
  const titleOpacity = Math.min(slamSpring, titleExit);

  // Portrait bounce animation synced to speech energy
  const portraitEnter = spring({
    frame: Math.max(0, frame - 10),
    fps,
    config: { damping: 14, stiffness: 180 },
  });
  const talkBounce = Math.abs(Math.sin(frame * 0.75)) * 6;
  const talkTilt = Math.sin(frame * 0.55) * 2.5;

  // Active subtitle cue
  const activeCue = subtitles.find((c) => frame >= c.startFrame && frame <= c.endFrame);
  const cuePop = activeCue
    ? spring({
        frame: Math.max(0, frame - activeCue.startFrame),
        fps,
        config: { damping: 13, stiffness: 260, mass: 0.55 },
      })
    : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#040611', overflow: 'hidden' }}>
      {/* Raw Video Layer with Shake + Punchy Color Boost */}
      <AbsoluteFill
        style={{
          transform: `translate(${shakeX}px, ${shakeY}px) scale(${1.03 + (shakeAmp > 0 ? 0.02 : 0)})`,
          filter: 'contrast(1.12) saturate(1.22)',
          opacity: masterOpacity,
        }}
      >
        <OffthreadVideo
          src={staticFile(videoFile)}
          playbackRate={playbackRate}
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>

      {/* Ducked Music Bed + Crisp Spoken Voiceover */}
      <Audio src={staticFile(musicFile)} volume={0.28} />
      <Sequence from={6}>
        <Audio src={staticFile(voFile)} volume={1.0} />
      </Sequence>

      {/* Atmospheric Strobe Flash (Boss Red Alert / Victory Gold) */}
      {strobeOpacity > 0 && (
        <AbsoluteFill
          style={{
            background:
              mode === 'victory'
                ? `radial-gradient(circle, rgba(255,212,71,${strobeOpacity}) 0%, transparent 70%)`
                : `radial-gradient(circle, transparent 35%, rgba(255,30,75,${strobeOpacity * 1.4}) 100%)`,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Subtle Arcade CRT Scanlines + Cinematic Vignette */}
      <AbsoluteFill
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0px, rgba(0,0,0,0.16) 2px, transparent 2px, transparent 4px)',
          boxShadow: 'inset 0 0 110px rgba(0, 0, 0, 0.72)',
          pointerEvents: 'none',
        }}
      />

      {/* Cinematic Letterbox Bars */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 54,
          background: 'linear-gradient(to bottom, rgba(2,4,12,0.96), rgba(2,4,12,0.72))',
          borderBottom: `2px solid ${themeColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          fontFamily: "'Orbitron', 'Arial Black', sans-serif",
          opacity: masterOpacity,
        }}
      >
        <div
          style={{
            color: themeColor,
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: 5,
            textShadow: `0 0 14px ${themeColor}`,
          }}
        >
          ● {badgeText}
        </div>
        <div
          style={{
            color: '#e8f6ff',
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: 4,
            opacity: 0.85,
          }}
        >
          BOOT N ASS // TRANSMISSION LIVE
        </div>
      </div>

      {/* Dramatic Comic Slam Title Card */}
      {titleOpacity > 0.01 && (
        <div
          style={{
            position: 'absolute',
            top: 96,
            left: 0,
            right: 0,
            textAlign: 'center',
            opacity: titleOpacity,
            transform: `scale(${titleScale})`,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              padding: '14px 44px',
              background: 'rgba(4, 8, 22, 0.82)',
              borderTop: `3px solid ${themeColor}`,
              borderBottom: `3px solid ${accentColor}`,
              boxShadow: `0 0 40px ${themeColor}66`,
            }}
          >
            <div
              style={{
                fontFamily: "'Orbitron', 'Arial Black', sans-serif",
                fontSize: 54,
                fontWeight: 900,
                letterSpacing: 6,
                color: '#ffffff',
                textShadow: `0 0 24px ${themeColor}, 0 4px 0 #000`,
                lineHeight: 1.05,
              }}
            >
              {slamTitle}
            </div>
            <div
              style={{
                fontFamily: "'Orbitron', 'Arial Black', sans-serif",
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: 8,
                color: accentColor,
                textShadow: `0 0 16px ${accentColor}`,
                marginTop: 6,
              }}
            >
              {slamSubtitle}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Bar: Wacky Bouncing Character Portrait + Kinetic Neon Subtitles */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          left: 32,
          right: 32,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 24,
          opacity: masterOpacity,
        }}
      >
        {/* Wacky Radio Portrait Box */}
        <div
          style={{
            width: 148,
            flexShrink: 0,
            background: 'rgba(4, 10, 26, 0.92)',
            border: `3px solid ${themeColor}`,
            borderRadius: 10,
            padding: 8,
            boxShadow: `0 0 28px ${themeColor}88`,
            transform: `translateY(${interpolate(portraitEnter, [0, 1], [140, 0]) - talkBounce}px) rotate(${talkTilt}deg)`,
          }}
        >
          <Img
            src={staticFile(portraitFile)}
            style={{
              width: '100%',
              height: 128,
              objectFit: 'cover',
              borderRadius: 6,
              display: 'block',
            }}
          />
          <div
            style={{
              marginTop: 6,
              textAlign: 'center',
              fontFamily: "'Orbitron', 'Arial Black', sans-serif",
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: 2,
              color: themeColor,
            }}
          >
            {speakerName}
          </div>
          {/* Animated Fake Audio Equalizer Bars */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 4,
              height: 14,
              alignItems: 'flex-end',
              marginTop: 4,
            }}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((b) => {
              const h = 4 + Math.abs(Math.sin(frame * 0.65 + b * 1.1)) * 10;
              return (
                <div
                  key={b}
                  style={{
                    width: 8,
                    height: h,
                    background: b % 2 === 0 ? themeColor : accentColor,
                    borderRadius: 2,
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Kinetic Neon Subtitle Box */}
        <div
          style={{
            flex: 1,
            minHeight: 112,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px 28px',
            background: 'linear-gradient(135deg, rgba(4, 10, 26, 0.9), rgba(14, 6, 28, 0.88))',
            border: `2.5px solid ${activeCue?.highlight ? accentColor : themeColor}`,
            borderRadius: 10,
            boxShadow: `0 0 30px ${activeCue?.highlight ? accentColor : themeColor}55`,
          }}
        >
          {activeCue && (
            <div
              style={{
                fontFamily: "'Orbitron', 'Arial Black', sans-serif",
                fontSize: activeCue.highlight ? 38 : 31,
                fontWeight: 900,
                letterSpacing: 2,
                textAlign: 'center',
                lineHeight: 1.25,
                color: activeCue.highlight ? '#ffd447' : '#ffffff',
                textShadow: activeCue.highlight
                  ? '0 0 24px rgba(255, 212, 71, 0.95), 0 4px 0 #000'
                  : `0 0 16px ${themeColor}, 0 3px 0 #000`,
                transform: `scale(${interpolate(cuePop, [0, 1], [0.82, 1.0])})`,
              }}
            >
              {activeCue.text}
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
