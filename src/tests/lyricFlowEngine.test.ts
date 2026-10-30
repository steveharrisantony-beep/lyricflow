import { describe, expect, it } from 'vitest';
import {
  cleanYouTubeTitleForLyrics,
  alignAppleWordSyncWithYouTubeSubtitles,
  computeVideoDelayFromSubtitles,
  LYRIC_ENGINE_OPTIONS,
} from '../lyrics/lyricFlowEngine';
import {
  hasValidLrcTimestamps,
  normalizeTrackForLyricsLookup,
  rankCandidate,
} from '../metadata/trackInfo';
import {
  findActiveSkipSegment,
  computeLeadingNonMusicOffset,
  type SponsorBlockSegment,
} from '../music/sponsorBlock';
import {
  computeBackgroundAdaptiveLyricColors,
  resolveCuePlacement,
  LYRIC_PLACEMENT_MODES,
} from '../visualization/cinematic/kineticTypography';
import { getDeterministicSongPalette } from '../visualization/cinematic/contrast';
import {
  evaluateBlockyUrl,
  sanitizeYouTubePlayerJson,
  installYouTubeAdBlocker,
} from '../music/youtubeAdBlocker';
import {
  detectScript,
  preserveCasing,
  stripDiacritics,
  romanizeText,
} from '../romanization/romanize';
import { parseLRC } from '../lyrics/lrc';
import { buildCues, setLyricTimeline, getLyricState } from '../lyrics/lyricTimeline';
import { TEMPLATES, buildCinematicSchedule } from '../visualization/cinematic/catalog';
import { convertTtmlToEnhancedLrc } from '../lyrics/appleLyrics';

describe('YouTube metadata cleaning & 4-Engine LyricFlow Engine', () => {
  it('deletes @handles, everything from the first bracket onwards, pipes, and leading dashes', () => {
    const raw =
      '\u202a@SaiAbhyankkar\u202c - Aasa Kooda (Music Video) | Thejo Bharathwaj | Preity Mukhundhan | Sai Smriti';
    expect(cleanYouTubeTitleForLyrics(raw)).toBe('Aasa Kooda');
  });

  it('extracts the true song title for Punchiri, Sing Along, and Veezha Veera Lyrical YouTube titles', () => {
    expect(
      cleanYouTubeTitleForLyrics(
        'Punchiri - Eechuu | Suhas | Chris Wayne | Steel | Loopd | Official Music Video',
        'Divo Music'
      )
    ).toBe('Punchiri');

    expect(
      cleanYouTubeTitleForLyrics(
        'Punchiri - Sing Along | Eechuu | Suhas | Chris Wayne | Steel | Loopd | Malayalam Song',
        'Divo Music'
      )
    ).toBe('Punchiri');

    expect(
      cleanYouTubeTitleForLyrics(
        'Veezha Veera Lyrical (Tamil) | OM | Dhanush | Mammootty | Sai Pallavi | Rajkumar | Sai Abhyankkar',
        'Think Music India'
      )
    ).toBe('Veezha Veera');
  });

  it('skips artist and album when normalizing YouTube-sourced tracks for lyric lookup while preserving videoTitle for candidate ranking', () => {
    const rawVideoTitle = 'Punchiri - Eechuu | Suhas | Chris Wayne | Steel | Loopd | Official Music Video';
    const normalized = normalizeTrackForLyricsLookup({
      title: rawVideoTitle,
      artist: 'Divo Music',
      album: 'YouTube Uploads',
      duration: 170,
      source: 'provider',
      confidence: 1,
      youtubeVideoId: 'abc123xyz00',
    });
    expect(normalized.title).toBe('Punchiri');
    expect(normalized.artist).toBe('');
    expect(normalized.album).toBe('');
    expect(normalized.videoTitle).toBe(rawVideoTitle);
  });

  it('ranks post-search candidates by matching candidate artist and album names against the full raw song title', () => {
    const normalized = normalizeTrackForLyricsLookup({
      title: 'Punchiri - Eechuu | Suhas | Chris Wayne | Steel | Loopd | Official Music Video',
      artist: 'Divo Music',
      album: '',
      duration: 170,
      source: 'provider',
      confidence: 1,
      youtubeVideoId: 'abc123xyz00',
    });

    const exactArtistMatch = rankCandidate(normalized, {
      id: 101,
      trackName: 'Punchiri',
      artistName: 'Eechuu, Suhas & Chris Wayne',
      albumName: 'Punchiri - Single',
      duration: 165,
      instrumental: false,
      syncedLyrics: '[00:10.00]Paal polethe punchiri',
    });

    const wrongArtistSameTitle = rankCandidate(normalized, {
      id: 102,
      trackName: 'Punchiri',
      artistName: 'Unrelated Orchestra',
      albumName: 'Old Classics',
      duration: 210,
      instrumental: false,
      syncedLyrics: '[00:10.00]Different song',
    });

    const nonMatchingTitle = rankCandidate(normalized, {
      id: 103,
      trackName: 'Random Unrelated Song',
      artistName: 'Eechuu',
      albumName: 'Single',
      duration: 165,
      instrumental: false,
      syncedLyrics: '[00:10.00]Wrong song',
    });

    expect(exactArtistMatch.confidence).toBeGreaterThan(wrongArtistSameTitle.confidence);
    expect(exactArtistMatch.confidence).toBeGreaterThanOrEqual(0.75);
    expect(nonMatchingTitle.confidence).toBe(0);
  });

  it('supports simultaneous dual-singer cues on two sides and holds both sides until the second singer finishes', () => {
    const ttml = [
      '<tt xmlns:ttm="http://www.w3.org/ns/ttml#metadata">',
      '<body><div>',
      '<p begin="00:10.00" end="00:13.00" ttm:agent="v1">',
      '<span begin="00:10.00" end="00:11.50">Hold</span> <span begin="00:11.50" end="00:12.80">the line</span>',
      '<span ttm:role="x-bg"><span begin="00:10.80" end="00:12.50">(Stay</span> <span begin="00:12.50" end="00:15.20">with me tonight)</span></span>',
      '</p>',
      '</div></body></tt>',
    ].join('');

    const converted = convertTtmlToEnhancedLrc(ttml);
    const parsed = parseLRC(converted.lrc);
    expect(parsed.length).toBe(2);

    const cues = buildCues(parsed, []);
    setLyricTimeline(cues, 0, 'original');

    // Both cues share the same duetGroupKey and extended end time (until the second side finishes)
    expect(cues[0].duetSide).toBe('left');
    expect(cues[1].duetSide).toBe('right');
    expect(cues[0].duetGroupKey).toBeTruthy();
    expect(cues[0].duetGroupKey).toBe(cues[1].duetGroupKey);
    expect(cues[0].end).toBeCloseTo(cues[1].end, 2);

    // At 14.2s, Singer 1 (left) has already finished singing (at 12.8s), while Singer 2 (right) is still singing (until 15.2s).
    // Both cues must remain active in their locked left/right positions until Singer 2 finishes!
    const stateAfterFirstFinishes = getLyricState(14.2);
    expect(stateAfterFirstFinishes.cue?.text).toBe('Hold the line');
    expect(stateAfterFirstFinishes.cue?.duetSide).toBe('left');
    expect(stateAfterFirstFinishes.secondaryCue?.text).toBe('Stay with me tonight');
    expect(stateAfterFirstFinishes.secondaryCue?.duetSide).toBe('right');
  });

  it('snaps scheduled scene boundaries so neither background nor lyric animation style changes in the middle of a line', () => {
    const cues = buildCues(
      [
        { time: 10, text: 'First lyric line starts at ten' },
        { time: 13.2, text: 'Second lyric line spans across the fourteen second mark' },
        { time: 20, text: 'Third lyric line starts at twenty' },
      ],
      []
    );
    const schedule = buildCinematicSchedule(
      [
        {
          start: 0,
          end: 28,
          mood: 'celebration',
          font: 'grotesk',
          motion: 'surge',
          camera: 'dolly',
          confidence: 0.8,
          palette: 0,
          reason: 'test',
          energy: 0.7,
        },
      ],
      cues,
      'pop',
      'test-song'
    );
    for (const scene of schedule) {
      for (const cue of cues) {
        const startsMidLine = scene.start > cue.time + 0.03 && scene.start < cue.end - 0.03;
        const endsMidLine = scene.end > cue.time + 0.03 && scene.end < cue.end - 0.03;
        expect(startsMidLine).toBe(false);
        expect(endsMidLine).toBe(false);
      }
    }
  });

  it('exposes all 4 selectable lyric engine options in the required order', () => {
    expect(LYRIC_ENGINE_OPTIONS.map(o => o.id)).toEqual([
      'lyricflow',
      'apple',
      'lrclib',
      'youtube',
    ]);
  });

  it('aligns Apple Music word-by-word timestamps onto YouTube video subtitle timestamps', () => {
    // Studio song starts at 10.00s, but YouTube music video has a 25.00s dramatic intro so vocals start at 35.00s
    const appleWordLrc = [
      '[00:10.00]<00:10.00>Hello <00:10.80>from <00:11.50>the <00:12.20>other <00:13.00>side',
      '[00:15.00]<00:15.00>I <00:15.50>must <00:16.20>have <00:17.00>called <00:17.80>a <00:18.20>thousand <00:19.00>times',
    ].join('\n');

    const youtubeSubtitlesLrc = [
      '[00:35.00]Hello from the other side',
      '[00:40.00]I must have called a thousand times',
    ].join('\n');

    const aligned = alignAppleWordSyncWithYouTubeSubtitles(
      appleWordLrc,
      '',
      youtubeSubtitlesLrc,
      0
    );

    expect(aligned.matchedAnchors).toBe(2);
    expect(aligned.appliedMedianOffsetSec).toBeCloseTo(25.0, 1);

    const parsed = parseLRC(aligned.lrc);
    expect(parsed.length).toBe(2);
    expect(parsed[0].time).toBeCloseTo(35.0, 1);
    expect(parsed[0].words?.[0]?.start).toBeCloseTo(35.0, 1);
    expect(parsed[0].words?.[1]?.start).toBeGreaterThan(35.4);
    expect(parsed[1].time).toBeCloseTo(40.0, 1);
  });

  it('enforces light-themed text colors when overlaid on video', () => {
    const colors = computeBackgroundAdaptiveLyricColors('#f5f5f5', '#111111', '#222222', undefined, true);
    expect(colors.baseColor.toLowerCase()).toBe('#f8fafc');
    expect(colors.effectiveBgHex).toBe('#07090e');
  });

  it('provides spatial lyric stage placements beyond center', () => {
    const ids = LYRIC_PLACEMENT_MODES.map(m => m.id);
    expect(ids).toContain('left');
    expect(ids).toContain('right');
    expect(ids).toContain('bottom-right');
    expect(ids).toContain('alternating');
    const [sampleCue] = buildCues([{ time: 12, text: 'Test line' }], []);
    const placement = resolveCuePlacement(
      sampleCue,
      { ...TEMPLATES[0], start: 0, end: 20, variation: 0, section: 0, reason: 'test' },
      'bottom-right'
    );
    expect(placement).toBe('bottom-right');
  });

  it('detects SponsorBlock non-music and sponsor segments and computes leading offset', () => {
    const segments: SponsorBlockSegment[] = [
      { uuid: 'seg-1', segment: [0, 18.5], category: 'music_offtopic', actionType: 'skip' },
      { uuid: 'seg-2', segment: [120, 135], category: 'sponsor', actionType: 'skip' },
    ];
    expect(computeLeadingNonMusicOffset(segments)).toBeCloseTo(18.5, 2);
    expect(findActiveSkipSegment(segments, 5.0)?.uuid).toBe('seg-1');
    expect(findActiveSkipSegment(segments, 50.0)).toBeNull();
    expect(findActiveSkipSegment(segments, 125.0)?.uuid).toBe('seg-2');
  });

  it('computes background video delay from creator-uploaded subtitles when language matches and ignores auto-generated or mismatched language', () => {
    const songLyrics = [
      '[00:10.00]Walking down the city street tonight',
      '[00:15.00]Underneath the glowing neon light',
      '[00:20.00]Hear the distant thunder in the sky',
      '[00:25.00]We are never going to say goodbye',
    ].join('\n');

    // Video has a 14.5s cinematic intro before the music starts, so subtitles are +14.5s later
    const videoSubLrc = [
      '[00:24.50]Walking down the city street tonight',
      '[00:29.50]Underneath the glowing neon light',
      '[00:34.50]Hear the distant thunder in the sky',
      '[00:39.50]We are never going to say goodbye',
    ].join('\n');

    // Auto-generated subtitles (id starts with a. or label has auto-generated) must be ignored
    const autoTrack = {
      id: 'a.en',
      languageCode: 'en',
      label: 'English (auto-generated)',
      lrc: videoSubLrc,
      lineCount: 4,
    };
    expect(computeVideoDelayFromSubtitles(songLyrics, [autoTrack]).matched).toBe(false);

    // Mismatched language (e.g., Malayalam lyrics vs English translated subtitles) must be ignored
    const malayalamLyrics = [
      '[00:10.00]മഴ പെയ്യുന്നു രാത്രിയിൽ',
      '[00:15.00]കാറ്റിൽ ആടുന്നു മരങ്ങൾ',
      '[00:20.00]നിലാവ് ഉദിക്കുന്നു മാനത്ത്',
      '[00:25.00]പാടുന്നു നമ്മൾ ഒന്നായി',
    ].join('\n');
    const creatorEnglishTrack = {
      id: 'en',
      languageCode: 'en',
      label: 'English',
      lrc: videoSubLrc,
      lineCount: 4,
    };
    expect(computeVideoDelayFromSubtitles(malayalamLyrics, [creatorEnglishTrack]).matched).toBe(false);

    // Creator-uploaded subtitles in matching language compute videoDelaySeconds = -14.5s
    const synced = computeVideoDelayFromSubtitles(songLyrics, [creatorEnglishTrack]);
    expect(synced.matched).toBe(true);
    expect(synced.videoDelaySeconds).toBeCloseTo(-14.5, 2);
    expect(synced.anchorCount).toBeGreaterThanOrEqual(3);
  });

  it('supports rawOverride bracket preservation in manual search and validates true LRC timestamps', () => {
    const rawTrack = {
      title: 'Aasa Kooda (Acoustic Version) [Live]',
      artist: 'Sai Abhyankkar (feat. Sai Smriti)',
      album: 'Single',
      duration: 215,
      source: 'manual' as const,
      confidence: 1,
    };
    const cleaned = normalizeTrackForLyricsLookup(rawTrack, false);
    expect(cleaned.title).toBe('Aasa Kooda');

    const overridden = normalizeTrackForLyricsLookup(rawTrack, true);
    expect(overridden.title).toBe('Aasa Kooda (Acoustic Version) [Live]');
    expect(overridden.artist).toBe('Sai Abhyankkar (feat. Sai Smriti)');

    expect(hasValidLrcTimestamps('Plain text without timestamps\nSecond line')).toBe(false);
    expect(hasValidLrcTimestamps('[ar:Artist]\n[ti:Title]\nPlain body only')).toBe(false);
    expect(hasValidLrcTimestamps('[00:12.40]Timed lyric line')).toBe(true);
  });

  it('implements spotify-karaoke script detection, case preservation, diacritic stripping, and deterministic song palettes', () => {
    expect(detectScript(['മഴ പെയ്യുന്നു'])).toBe('malayalam');
    expect(detectScript(['அன்பே വാ'])).toBe('tamil');
    expect(preserveCasing('Hello WORLD', 'hello world')).toBe('Hello WORLD');
    expect(stripDiacritics('āīūēō ṇ ṭ')).toBe('aiueo n t');
    const rom = romanizeText('[00:05.00]മഴ പെയ്യുന്നു');
    expect(rom.changed).toBe(true);
    expect(rom.text.startsWith('[00:05.00]')).toBe(true);

    const paletteA = getDeterministicSongPalette('Aasa Kooda::Sai Abhyankkar');
    const paletteB = getDeterministicSongPalette('Illuminati::Sushin Shyam');
    expect(paletteA.accentHex).not.toBe(paletteB.accentHex);
    expect(paletteA.sungColor).not.toBe(paletteB.sungColor);
  });

  it('blocks YouTube ad domains & ad paths via 0xERR0R/blocky while preserving core video streams and sanitizes player JSON via RemoveAdblockThing', () => {
    expect(evaluateBlockyUrl('https://googleads.g.doubleclick.net/pagead/ads').blocked).toBe(true);
    expect(evaluateBlockyUrl('https://www.youtube.com/api/stats/ads?ver=2').blocked).toBe(true);
    expect(evaluateBlockyUrl('https://www.youtube.com/youtubei/v1/player/ad_break').blocked).toBe(true);
    expect(evaluateBlockyUrl('https://rr3---sn-abcd.googlevideo.com/videoplayback?ctier=L&id=123').blocked).toBe(false);

    // Core YouTube video streams and embeds must never be blocked
    expect(evaluateBlockyUrl('https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1').blocked).toBe(false);
    expect(evaluateBlockyUrl('https://rr3---sn-abcd.googlevideo.com/videoplayback?id=123&itag=140').blocked).toBe(false);

    const dirtyPlayer = {
      videoDetails: { videoId: 'dQw4w9WgXcQ', title: 'Test Song' },
      adPlacements: [{ adPlacementRenderer: {} }],
      playerAds: [{ playerLegacyDesktopWatchAdsRenderer: {} }],
      adSlots: [{ adSlotRenderer: {} }],
      auxiliaryUi: {
        messageRenderers: {
          bkaEnforcementMessageViewModel: { text: 'Ad blockers are not allowed' },
        },
      },
    };
    const cleaned = sanitizeYouTubePlayerJson(dirtyPlayer);
    expect(cleaned.videoDetails.videoId).toBe('dQw4w9WgXcQ');
    expect('adPlacements' in cleaned).toBe(false);
    expect('playerAds' in cleaned).toBe(false);
    expect('adSlots' in cleaned).toBe(false);
    expect('bkaEnforcementMessageViewModel' in cleaned.auxiliaryUi.messageRenderers).toBe(false);

    expect(() => installYouTubeAdBlocker()).not.toThrow();
  });
});


