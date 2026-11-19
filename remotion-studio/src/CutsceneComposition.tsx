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

export interface CameoConfig {
  portraitFile: string;
  label: string;
  bubbleText: string;
  startFrame: number;
  endFrame: number;
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
  impactStamp: string;
  telemetryText: string;
  themeColor: string;
  accentColor: string;
  mode: 'hero' | 'boss' | 'victory' | 'gameover';
  playbackRate?: number;
  subtitles: SubtitleCue[];
  cameo?: CameoConfig;
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
  impactStamp,
  telemetryText,
  themeColor,
  accentColor,
  mode,
  playbackRate = 1,
  subtitles,
  cameo,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const slamSpring = spring({
    frame: Math.max(0, frame - 6),
    fps,
    config: { damping: 11, stiffness: 240, mass: 0.68 },
  });

  const activeCue = subtitles.find((c) => frame >= c.startFrame && frame <= c.endFrame);
  const isHighlight = Boolean(activeCue?.highlight);

  // Impact shake on title slam AND during highlighted punchlines!
  const shakeAmp =
    frame >= 8 && frame <= 20
      ? interpolate(frame, [8, 20], [16, 0], { extrapolateRight: 'clamp' })
      : isHighlight && (mode === 'boss' || mode === 'gameover')
        ? 5.5
        : isHighlight
          ? 2.5
          : 0;

  const shakeX = Math.sin(frame * 2.9) * shakeAmp;
  const shakeY = Math.cos(frame * 3.7) * shakeAmp;

  const fadeIn = interpolate(frame, [0, 7], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 10, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp' }
  );
  const masterOpacity = Math.min(fadeIn, fadeOut);

  // Red-alert strobe / Golden victory pulse
  const strobeOpacity =
    mode === 'boss' || mode === 'gameover'
      ? Math.max(0, Math.sin(frame * 0.5)) * (isHighlight ? 0.34 : 0.22)
      : mode === 'victory'
        ? Math.max(0, Math.sin(frame * 0.28)) * 0.2
        : 0;

  // RGB Glitch split frames on boss slam & highlight moments
  const glitchActive =
    (mode === 'boss' || mode === 'gameover') &&
    ((frame >= 7 && frame <= 13) || (isHighlight && frame % 11 < 2));

  // Title banner visibility
  const titleExit = interpolate(frame, [52, 66], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const titleScale = interpolate(slamSpring, [0, 1], [2.5, 1.0]);
  const titleOpacity = Math.min(slamSpring, titleExit);

  // Portrait bounce animation
  const portraitEnter = spring({
    frame: Math.max(0, frame - 8),
    fps,
    config: { damping: 13, stiffness: 190 },
  });
  const talkBounce = Math.abs(Math.sin(frame * 0.78)) * (isHighlight ? 10 : 6);
  const talkTilt = Math.sin(frame * 0.55) * (isHighlight ? 4.2 : 2.2);

  // Subtitle pop spring
  const cuePop = activeCue
    ? spring({
        frame: Math.max(0, frame - activeCue.startFrame),
        fps,
        config: { damping: 12, stiffness: 270, mass: 0.5 },
      })
    : 0;

  // Comic Impact Stamp slam (appears during final third / highlight)
  const stampStart = Math.floor(durationInFrames * 0.45);
  const stampSpring = spring({
    frame: Math.max(0, frame - stampStart),
    fps,
    config: { damping: 9, stiffness: 260, mass: 0.6 },
  });
  const showStamp = frame >= stampStart && frame <= durationInFrames - 12;

  // Sidekick / Grunt Cameo reaction box (top-right!)
  const showCameo = cameo && frame >= cameo.startFrame && frame <= cameo.endFrame;
  const cameoSpring = cameo
    ? spring({
        frame: Math.max(0, frame - cameo.startFrame),
        fps,
        config: { damping: 12, stiffness: 220 },
      })
    : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#040611', overflow: 'hidden' }}>
      {/* Raw Video Layer with Shake + Punchy Arcade Contrast */}
      <AbsoluteFill
        style={{
          transform: `translate(${shakeX}px, ${shakeY}px) scale(${1.04 + (shakeAmp > 0 ? 0.025 : 0)})`,
          filter: glitchActive
            ? 'contrast(1.35) saturate(1.6) hue-rotate(-14deg)'
            : 'contrast(1.14) saturate(1.26)',
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

      {/* Ducked Music Bed + Spoken Voiceover */}
      <Audio src={staticFile(musicFile)} volume={0.26} />
      <Sequence from={6}>
        <Audio src={staticFile(voFile)} volume={1.0} />
      </Sequence>

      {/* Anime Radial Action Speed-Lines on Highlight Punchlines! */}
      {isHighlight && (
        <AbsoluteFill style={{ pointerEvents: 'none', opacity: 0.42 }}>
          <svg width="1280" height="720" viewBox="0 0 1280 720">
            {Array.from({ length: 24 }).map((_, i) => {
              const angle = (i / 24) * Math.PI * 2 + (frame % 6) * 0.04;
              const x1 = 640 + Math.cos(angle) * 340;
              const y1 = 360 + Math.sin(angle) * 210;
              const x2 = 640 + Math.cos(angle) * 780;
              const y2 = 360 + Math.sin(angle) * 520;
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={i % 2 === 0 ? accentColor : themeColor}
                  strokeWidth={i % 3 === 0 ? 5 : 2.5}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
        </AbsoluteFill>
      )}

      {/* Rising Golden Arcade Sparkles on Hero / Victory Scenes */}
      {(mode === 'victory' || mode === 'hero') && (
        <AbsoluteFill style={{ pointerEvents: 'none', opacity: masterOpacity * 0.85 }}>
          {Array.from({ length: 18 }).map((_, i) => {
            const x = ((i * 73 + 40) % 1200) + 40;
            const speed = 3.2 + (i % 5) * 1.4;
            const y = 760 - ((frame * speed + i * 65) % 820);
            const size = 6 + (i % 4) * 3;
            const twinkle = 0.4 + Math.abs(Math.sin(frame * 0.35 + i)) * 0.6;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: x,
                  top: y,
                  width: size,
                  height: size,
                  background: i % 2 === 0 ? '#ffd447' : '#00f0ff',
                  transform: `rotate(${frame * 6 + i * 30}deg)`,
                  boxShadow: `0 0 12px ${i % 2 === 0 ? '#ffd447' : '#00f0ff'}`,
                  opacity: twinkle,
                }}
              />
            );
          })}
        </AbsoluteFill>
      )}

      {/* Atmospheric Strobe Flash */}
      {strobeOpacity > 0 && (
        <AbsoluteFill
          style={{
            background:
              mode === 'victory'
                ? `radial-gradient(circle, rgba(255,212,71,${strobeOpacity}) 0%, transparent 70%)`
                : `radial-gradient(circle, transparent 32%, rgba(255,30,75,${strobeOpacity * 1.5}) 100%)`,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Arcade CRT Scanlines + Vignette */}
      <AbsoluteFill
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0px, rgba(0,0,0,0.16) 2px, transparent 2px, transparent 4px)',
          boxShadow: 'inset 0 0 110px rgba(0, 0, 0, 0.72)',
          pointerEvents: 'none',
        }}
      />

      {/* Top Arcade HUD Letterbox Bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 54,
          background: 'linear-gradient(to bottom, rgba(2,4,12,0.96), rgba(2,4,12,0.78))',
          borderBottom: `2.5px solid ${themeColor}`,
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
            color: '#ffd447',
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: 3,
            opacity: 0.92,
          }}
        >
          {telemetryText}
        </div>
      </div>

      {/* Wacky Secondary Cameo Reaction Popup (Top-Right!) */}
      {showCameo && cameo && (
        <div
          style={{
            position: 'absolute',
            top: 74,
            right: 28,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'rgba(6, 12, 30, 0.92)',
            border: `2.5px solid ${accentColor}`,
            borderRadius: 10,
            padding: '8px 14px 8px 8px',
            boxShadow: `0 0 24px ${accentColor}77`,
            transform: `translateX(${interpolate(cameoSpring, [0, 1], [260, 0])}px) rotate(${Math.sin(frame * 0.6) * 2}deg)`,
          }}
        >
          <Img
            src={staticFile(cameo.portraitFile)}
            style={{
              width: 72,
              height: 72,
              borderRadius: 6,
              objectFit: 'cover',
              border: `2px solid ${themeColor}`,
            }}
          />
          <div>
            <div
              style={{
                fontFamily: "'Orbitron', 'Arial Black', sans-serif",
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: 2,
                color: accentColor,
              }}
            >
              {cameo.label}
            </div>
            <div
              style={{
                fontFamily: "'Orbitron', 'Arial Black', sans-serif",
                fontSize: 20,
                fontWeight: 900,
                color: '#ffffff',
                textShadow: '0 2px 0 #000',
                marginTop: 2,
              }}
            >
              "{cameo.bubbleText}"
            </div>
          </div>
        </div>
      )}

      {/* Bouncing Comic Impact Stamp Badge! */}
      {showStamp && (
        <div
          style={{
            position: 'absolute',
            top: 78,
            left: 34,
            padding: '8px 20px',
            background: accentColor,
            color: '#060812',
            fontFamily: "'Orbitron', 'Arial Black', sans-serif",
            fontSize: 20,
            fontWeight: 900,
            letterSpacing: 3,
            border: '3px solid #ffffff',
            borderRadius: 6,
            boxShadow: `0 0 26px ${accentColor}, 0 6px 0 #000`,
            transform: `rotate(-8deg) scale(${interpolate(stampSpring, [0, 1], [2.2, 1.0])})`,
            opacity: Math.min(stampSpring, masterOpacity),
          }}
        >
          ★ {impactStamp} ★
        </div>
      )}

      {/* Dramatic Comic Slam Title Card */}
      {titleOpacity > 0.01 && (
        <div
          style={{
            position: 'absolute',
            top: 108,
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
              padding: '16px 48px',
              background: 'rgba(4, 8, 22, 0.86)',
              borderTop: `4px solid ${themeColor}`,
              borderBottom: `4px solid ${accentColor}`,
              boxShadow: `0 0 46px ${themeColor}77`,
            }}
          >
            <div
              style={{
                fontFamily: "'Orbitron', 'Arial Black', sans-serif",
                fontSize: 56,
                fontWeight: 900,
                letterSpacing: 6,
                color: '#ffffff',
                textShadow: `0 0 26px ${themeColor}, 0 5px 0 #000`,
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
          bottom: 22,
          left: 32,
          right: 32,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 24,
          opacity: masterOpacity,
        }}
      >
        <div
          style={{
            width: 152,
            flexShrink: 0,
            background: 'rgba(4, 10, 26, 0.94)',
            border: `3px solid ${isHighlight ? accentColor : themeColor}`,
            borderRadius: 10,
            padding: 8,
            boxShadow: `0 0 32px ${isHighlight ? accentColor : themeColor}99`,
            transform: `translateY(${interpolate(portraitEnter, [0, 1], [150, 0]) - talkBounce}px) rotate(${talkTilt}deg)`,
          }}
        >
          <Img
            src={staticFile(portraitFile)}
            style={{
              width: '100%',
              height: 130,
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
              color: isHighlight ? accentColor : themeColor,
            }}
          >
            {speakerName}
          </div>
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
              const h = 4 + Math.abs(Math.sin(frame * 0.7 + b * 1.15)) * (isHighlight ? 12 : 9);
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

        <div
          style={{
            flex: 1,
            minHeight: 114,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px 28px',
            background: 'linear-gradient(135deg, rgba(4, 10, 26, 0.92), rgba(16, 6, 32, 0.9))',
            border: `3px solid ${isHighlight ? accentColor : themeColor}`,
            borderRadius: 10,
            boxShadow: `0 0 34px ${isHighlight ? accentColor : themeColor}66`,
          }}
        >
          {activeCue && (
            <div
              style={{
                fontFamily: "'Orbitron', 'Arial Black', sans-serif",
                fontSize: isHighlight ? 40 : 31,
                fontWeight: 900,
                letterSpacing: 2,
                textAlign: 'center',
                lineHeight: 1.24,
                color: isHighlight ? '#ffd447' : '#ffffff',
                textShadow: isHighlight
                  ? '0 0 28px rgba(255, 212, 71, 0.98), 0 4px 0 #000'
                  : `0 0 16px ${themeColor}, 0 3px 0 #000`,
                transform: `scale(${interpolate(cuePop, [0, 1], [0.78, 1.0])})`,
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
