import { describe, expect, it } from 'vitest';
import {
  cleanYouTubeTitleForLyrics,
  alignAppleWordSyncWithYouTubeSubtitles,
  LYRIC_ENGINE_OPTIONS,
} from '../lyrics/lyricFlowEngine';
import { normalizeTrackForLyricsLookup, rankCandidate } from '../metadata/trackInfo';
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
});

