import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TrackInfo } from "../metadata/trackInfo";
import {
  ALL_ROMANIZATION_LANGUAGE_CODES,
  detectLanguage,
  getEnabledRomanizationLanguages,
  getRomanizationMasterEnabled,
  hasDistinctRomanized,
  isLatinScript,
  romanizeLrcTextAsync,
  romanizeText,
  setEnabledRomanizationLanguages,
  setRomanizationMasterEnabled,
  SUPPORTED_ROMANIZATION_LANGUAGES,
  type RomanizationLanguageCode,
} from "../romanization/romanize";
import {
  buildCinematicSchedule,
  byId,
  resolveThemePalette,
  type SceneId,
} from "../visualization/cinematic/catalog";
import type { AlbumArtLyricPalette } from "../visualization/cinematic/contrast";
import {
  computeBackgroundAdaptiveLyricColors,
  resolveLyricFillPace,
  type LyricFillPaceMode,
} from "../visualization/cinematic/kineticTypography";
import { convertTtmlToEnhancedLrc } from "./appleLyrics";
import { parseLRC, type TimedWord } from "./lrc";
import {
  buildCues,
  computeNaturalLineEnd,
  setLyricTimeline,
} from "./lyricTimeline";
import { clampLyricDelay, effectiveLyricTime } from "./lyricTiming";
import { analyzeSections } from "./sceneDirector";
import { saveUserLyrics } from "./userLibrary";
export { normalizeTrack as cleanTrackTitle } from "../metadata/trackInfo";
export { parseLRC } from "./lrc";

export interface IncomingLyrics {
  original: string;
  romanized: string;
  plain?: string;
  source: string;
  sourceUrl?: string;
  hasWordSync?: boolean;
  token: number;
}

export interface LyricProviderBadgeInfo {
  providerName: string;
  syncMode: string;
  detail: string;
}

export interface AudioSourceBadgeInfo {
  providerName: string;
  detail: string;
  isLocal: boolean;
  sourceUrl?: string;
}

/**
 * Split a long lyric line into multiple balanced lines so it is never displayed
 * as a single overly long line.
 */
export function splitLyricIntoBalancedLines(
  text: string,
  maxCharsPerLine = 36,
  maxWordsPerLine = 6,
): string[] {
  const trimmed = (text || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return [];
  const words = trimmed.split(" ");
  if (words.length <= maxWordsPerLine && trimmed.length <= maxCharsPerLine)
    return [trimmed];

  const byWords = Math.ceil(words.length / maxWordsPerLine);
  const byChars = Math.ceil(trimmed.length / maxCharsPerLine);
  const targetRows = Math.min(words.length, Math.max(2, byWords, byChars));
  const targetCharsPerRow = Math.ceil(trimmed.length / targetRows);

  const rows: string[] = [];
  let currentWords: string[] = [];
  let currentLen = 0;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const nextLen = currentLen + (currentWords.length > 0 ? 1 : 0) + w.length;
    const remainingWords = words.length - i;
    const remainingRows = targetRows - rows.length;

    const hasClauseBreak =
      currentWords.length >= 2 &&
      /[,;—–\-:!?]$/.test(currentWords[currentWords.length - 1]);
    const exceedsTarget =
      currentWords.length > 0 &&
      (nextLen > maxCharsPerLine ||
        currentWords.length >= maxWordsPerLine ||
        (nextLen > targetCharsPerRow + 4 && remainingWords >= remainingRows));

    if (
      rows.length < targetRows - 1 &&
      (exceedsTarget ||
        (hasClauseBreak && currentLen >= targetCharsPerRow * 0.65))
    ) {
      rows.push(currentWords.join(" "));
      currentWords = [w];
      currentLen = w.length;
    } else {
      currentWords.push(w);
      currentLen = nextLen;
    }
  }
  if (currentWords.length > 0) rows.push(currentWords.join(" "));
  return rows;
}

/**
 * Partition word-synced tokens into balanced multi-line rows so word-synced lyrics
 * wrap cleanly into multiple lines when long.
 */
export function splitWordsIntoBalancedRows<T extends { text: string }>(
  words: readonly T[],
  maxCharsPerRow = 36,
  maxWordsPerRow = 6,
): T[][] {
  if (!words.length) return [];
  const totalChars =
    words.reduce((sum, w) => sum + w.text.length, 0) +
    Math.max(0, words.length - 1);
  if (words.length <= maxWordsPerRow && totalChars <= maxCharsPerRow)
    return [[...words]];

  const byWords = Math.ceil(words.length / maxWordsPerRow);
  const byChars = Math.ceil(totalChars / maxCharsPerRow);
  const targetRows = Math.min(words.length, Math.max(2, byWords, byChars));
  const targetCharsPerRow = Math.ceil(totalChars / targetRows);

  const rows: T[][] = [];
  let currentRow: T[] = [];
  let currentLen = 0;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const nextLen =
      currentLen + (currentRow.length > 0 ? 1 : 0) + w.text.length;
    const remainingWords = words.length - i;
    const remainingRows = targetRows - rows.length;
    const hasClauseBreak =
      currentRow.length >= 2 &&
      /[,;—–\-:!?]$/.test(currentRow[currentRow.length - 1].text);
    const exceedsTarget =
      currentRow.length > 0 &&
      (nextLen > maxCharsPerRow ||
        currentRow.length >= maxWordsPerRow ||
        (nextLen > targetCharsPerRow + 4 && remainingWords >= remainingRows));

    if (
      rows.length < targetRows - 1 &&
      (exceedsTarget ||
        (hasClauseBreak && currentLen >= targetCharsPerRow * 0.65))
    ) {
      rows.push(currentRow);
      currentRow = [w];
      currentLen = w.text.length;
    } else {
      currentRow.push(w);
      currentLen = nextLen;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);
  return rows;
}

export function describeLyricProvider(
  source: string,
  hasWordSync: boolean,
  hasTimedLines: boolean,
  hasPlainText: boolean,
): LyricProviderBadgeInfo {
  const raw = (source || "").trim();
  let providerName = "Automatic Provider";
  if (/lyricflow\s*engine/i.test(raw)) providerName = "LyricFlow Engine";
  else if (/youtube\s*subtitles/i.test(raw)) providerName = "YouTube Subtitles";
  else if (/apple\s*library/i.test(raw)) providerName = "Apple Library";
  else if (/apple\s*music|itunes|paxsenix|lrc\.red|binimum/i.test(raw))
    providerName = "Apple Music";
  else if (/musixmatch/i.test(raw)) providerName = "MusixMatch";
  else if (/lrclib|lrc\s*library/i.test(raw)) providerName = "LRC Library";
  else if (/kugou/i.test(raw)) providerName = "KuGou";
  else if (/youtube\s*music|innertube/i.test(raw))
    providerName = "YouTube Music";
  else if (/local|imported|file/i.test(raw)) providerName = "Local File";
  else if (/custom|saved|override|sample|edited/i.test(raw))
    providerName = "Custom / Local";
  else if (/searching|resolving/i.test(raw))
    providerName = "Resolving Provider…";
  else if (!hasTimedLines && !hasPlainText) providerName = "Awaiting Song";
  else if (raw.includes("·")) providerName = raw.split("·")[0].trim();
  else if (raw) providerName = raw;

  const syncMode = hasWordSync
    ? "Word-Synced TTML"
    : hasTimedLines
      ? "Line-Synced LRC"
      : hasPlainText
        ? "Plain Lyrics"
        : /searching|resolving/i.test(raw)
          ? "Searching…"
          : "Standby";

  return {
    providerName,
    syncMode,
    detail:
      raw || "LyricFlow Engine (YouTube Subtitles + Apple Library Word-Sync)",
  };
}

export function describeAudioSource(
  track: TrackInfo | null,
  trackLoaded: boolean,
): AudioSourceBadgeInfo {
  if (!track || (!trackLoaded && !track.title.trim())) {
    return {
      providerName: "No Audio Loaded",
      detail: "Choose Local Audio Upload or Stash Online Player",
      isLocal: false,
    };
  }
  if (
    track.source === "filename" ||
    track.provider === "local" ||
    Boolean(track.fileName)
  ) {
    const fileLabel = track.fileName
      ? `Local File · ${track.fileName}`
      : track.audioSource || "Local Audio File";
    return {
      providerName: "Local File",
      detail: fileLabel,
      isLocal: true,
    };
  }
  const rawAudio = (track.audioSource || "").trim();
  let providerName = "Online Stream";
  if (track.provider === "jiosaavn" || /^jiosaavn/i.test(rawAudio))
    providerName = "JioSaavn";
  else if (track.provider === "ytmusic" || /^youtube\s*music/i.test(rawAudio))
    providerName = "YouTube Music";
  else if (track.provider === "soundcloud" || /^soundcloud/i.test(rawAudio))
    providerName = "SoundCloud";
  else if (track.provider === "audius" || /^audius/i.test(rawAudio))
    providerName = "Audius";
  else if (track.provider === "resolver" || /^youtube/i.test(rawAudio))
    providerName = "YouTube";
  else if (rawAudio) providerName = rawAudio.split("·")[0].trim();

  return {
    providerName,
    detail: rawAudio || `${providerName} Stream`,
    isLocal: false,
    sourceUrl: track.sourceUrl,
  };
}

export type LyricColorMode =
  | "auto"
  | "album"
  | "cyan"
  | "rose"
  | "gold"
  | "emerald"
  | "violet"
  | "coral"
  | "white";

export const LYRIC_COLOR_MAP: Record<
  Exclude<LyricColorMode, "auto">,
  { main: string; highlight: string; label: string }
> = {
  album: {
    main: "#38bdf8",
    highlight: "#bae6fd",
    label: "Album Art Colour (Per Song)",
  },
  cyan: { main: "#72efdd", highlight: "#aef8ff", label: "Cyan Glow" },
  rose: { main: "#ff6b8b", highlight: "#ffc2d1", label: "Neon Rose" },
  gold: { main: "#ffd166", highlight: "#fff0a8", label: "Solar Gold" },
  emerald: { main: "#80ed99", highlight: "#c7f9cc", label: "Emerald Pulse" },
  violet: { main: "#c792ea", highlight: "#e9d5ff", label: "Electric Violet" },
  coral: { main: "#ff9f43", highlight: "#ffd8a8", label: "Warm Coral" },
  white: { main: "#ffffff", highlight: "#97e0e9", label: "Classic White" },
};

export default function ManualLyrics({
  time,
  trackLoaded,
  isPlaying = true,
  track,
  incoming,
  delay,
  onDelayChange,
  customEditOpen,
  onToggleCustomEdit,
  onSaveCustomOverride,
  onLyricContentChange,
  enabledScenes,
  activeSceneId = "holographic-tide",
  themePalettes,
  lyricColorMode: controlledColorMode,
  onLyricColorModeChange,
  albumArtPalette,
  isVideoBackground = false,
  lyricFillPaceMode: controlledFillPaceMode,
  onLyricFillPaceModeChange,
  displayMode: controlledDisplayMode,
  onDisplayModeChange,
  minFontSize = 26,
  maxFontSize = 88,
  fontScale = 1,
  onMinFontSizeChange,
  onMaxFontSizeChange,
  onFontScaleChange,
  bpm = 0,
  romanizationEnabled: controlledRomanEnabled,
  onRomanizationEnabledChange,
  enabledRomanizationLanguages: controlledRomanLangs,
  onEnabledRomanizationLanguagesChange,
  mappingTarget,
}: {
  mappingTarget?: HTMLElement | null;
  time: number;
  trackLoaded: boolean;
  isPlaying?: boolean;
  track: TrackInfo | null;
  incoming: IncomingLyrics | null;
  delay: number;
  onDelayChange: (value: number) => void;
  customEditOpen?: boolean;
  onToggleCustomEdit?: () => void;
  onSaveCustomOverride?: (lrc: string) => void;
  onLyricContentChange?: (
    original: string,
    sourceUrl: string,
    sourceName: string,
    offset?: number,
  ) => void;
  enabledScenes?: readonly SceneId[];
  activeSceneId?: SceneId;
  themePalettes?: Record<string, string>;
  lyricColorMode?: LyricColorMode;
  onLyricColorModeChange?: (mode: LyricColorMode) => void;
  albumArtPalette?: AlbumArtLyricPalette | null;
  isVideoBackground?: boolean;
  lyricFillPaceMode?: LyricFillPaceMode;
  onLyricFillPaceModeChange?: (pace: LyricFillPaceMode) => void;
  displayMode?: "original" | "romanized" | "both";
  onDisplayModeChange?: (mode: "original" | "romanized" | "both") => void;
  minFontSize?: number;
  maxFontSize?: number;
  fontScale?: number;
  onMinFontSizeChange?: (size: number) => void;
  onMaxFontSizeChange?: (size: number) => void;
  onFontScaleChange?: (scale: number) => void;
  bpm?: number;
  romanizationEnabled?: boolean;
  onRomanizationEnabledChange?: (enabled: boolean) => void;
  enabledRomanizationLanguages?: RomanizationLanguageCode[];
  onEnabledRomanizationLanguagesChange?: (
    langs: RomanizationLanguageCode[],
  ) => void;
}) {
  const [raw, setRaw] = useState("");
  const [roman, setRoman] = useState("");
  const [plain, setPlain] = useState("");
  const [internalMode, setInternalMode] = useState<
    "original" | "romanized" | "both"
  >("both");
  const [internalColorMode, setInternalColorMode] =
    useState<LyricColorMode>("auto");
  const [internalFillPace, setInternalFillPace] =
    useState<LyricFillPaceMode>("auto");
  const [offset, setOffset] = useState(0);
  const [genre, setGenre] = setGenreState("");
  const [source, setSource] = useState("Automatic (Apple Music / LRCLIB)");
  const [sourceUrl, setSourceUrl] = useState("");
  const [corrected, setCorrected] = useState(false);
  const [message, setMessage] = useState("");
  const [internalAutoRoman, setInternalAutoRoman] = useState(() =>
    getRomanizationMasterEnabled(),
  );
  const [internalRomanLangs, setInternalRomanLangs] = useState<
    RomanizationLanguageCode[]
  >(() => getEnabledRomanizationLanguages());
  const [delayDraft, setDelayDraft] = useState(() => String(delay));
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDelayDraft((prev) => {
      const normalized = prev.trim().replace(/−/g, "-");
      if (
        normalized === "-" ||
        normalized === "-." ||
        normalized === "-0." ||
        normalized === ""
      )
        return prev;
      const parsed = Number(normalized);
      if (Number.isFinite(parsed) && Math.abs(parsed - delay) < 0.001)
        return prev;
      return String(delay);
    });
  }, [delay]);

  const autoRoman = controlledRomanEnabled ?? internalAutoRoman;
  const setAutoRoman = (next: boolean) => {
    setRomanizationMasterEnabled(next);
    setInternalAutoRoman(next);
    onRomanizationEnabledChange?.(next);
  };

  const enabledRomanLangs = controlledRomanLangs ?? internalRomanLangs;
  const setEnabledRomanLangs = (next: RomanizationLanguageCode[]) => {
    setEnabledRomanizationLanguages(next);
    setInternalRomanLangs(next);
    onEnabledRomanizationLanguagesChange?.(next);
  };
  const toggleRomanLang = (code: RomanizationLanguageCode) => {
    const exists = enabledRomanLangs.includes(code);
    const next = exists
      ? enabledRomanLangs.filter((c) => c !== code)
      : [...enabledRomanLangs, code];
    setEnabledRomanLangs(next);
  };

  const mode = controlledDisplayMode ?? internalMode;
  const setMode = (next: "original" | "romanized" | "both") => {
    setInternalMode(next);
    onDisplayModeChange?.(next);
  };

  const lyricColorMode = controlledColorMode ?? internalColorMode;
  const setLyricColorMode = (next: LyricColorMode) => {
    setInternalColorMode(next);
    onLyricColorModeChange?.(next);
  };

  const lyricFillPaceMode = controlledFillPaceMode ?? internalFillPace;
  const setLyricFillPaceMode = (next: LyricFillPaceMode) => {
    setInternalFillPace(next);
    onLyricFillPaceModeChange?.(next);
  };

  function setGenreState(initial: string) {
    return useState(initial);
  }

  useLayoutEffect(() => {
    onLyricContentChange?.(raw, sourceUrl, source, offset);
  }, [raw, sourceUrl, source, offset, onLyricContentChange]);
  const lines = useMemo(() => parseLRC(raw), [raw]);
  const romanLines = useMemo(() => parseLRC(roman), [roman]);
  const language = useMemo(() => detectLanguage(raw || plain), [raw, plain]);
  const sections = useMemo(() => analyzeSections(lines, genre), [lines, genre]);
  const storyboard = useMemo(
    () =>
      buildCinematicSchedule(
        sections,
        buildCues(lines, romanLines, genre),
        genre,
        lines
          .map((l) => l.text)
          .join("|")
          .slice(0, 1500),
        enabledScenes,
      ),
    [sections, lines, romanLines, genre, enabledScenes],
  );

  useEffect(() => {
    setLyricTimeline(
      buildCues(lines, romanLines, genre),
      offset - delay,
      mode,
      genre,
    );
    return () => setLyricTimeline([]);
  }, [lines, romanLines, offset, delay, mode, genre]);

  useEffect(() => {
    if (!incoming) return;
    setRaw(incoming.original);
    setPlain(incoming.plain || "");
    const nextRoman = !autoRoman
      ? ""
      : incoming.romanized || romanizeText(incoming.original).text;
    setRoman(nextRoman);
    setSource(incoming.source);
    setSourceUrl(incoming.sourceUrl || "");
    setCorrected(false);
    setMessage(`Auto-loaded from ${incoming.source}.`);
  }, [incoming?.token]);

  // Upgrade non-Latin lyrics with haroldalan/spotify-karaoke Google phonetic romanization (dt=rm)
  // Only romanizes when Romanization is turned ON and the detected language is enabled.
  useEffect(() => {
    if (!raw || corrected) return;
    if (!autoRoman) {
      setRoman("");
      return;
    }
    const syncRes = romanizeText(raw);
    setRoman(syncRes.changed ? syncRes.text : "");
    const plainBody = raw
      .replace(/\[[^\]]*\]/g, "")
      .replace(/<[^>]*>/g, "")
      .trim();
    if (!plainBody || isLatinScript(plainBody)) return;
    const controller = new AbortController();
    void romanizeLrcTextAsync(raw, controller.signal)
      .then((upgraded) => {
        if (!controller.signal.aborted && upgraded && upgraded.trim()) {
          setRoman(upgraded !== raw ? upgraded : "");
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [raw, autoRoman, enabledRomanLangs.join(","), corrected]);

  useEffect(() => {
    if (!trackLoaded) setOffset(0);
  }, [trackLoaded]);

  function updateRaw(value: string) {
    if (value.includes("<tt") || value.includes("<p begin=")) {
      const converted = convertTtmlToEnhancedLrc(value);
      if (converted.lrc) {
        setRaw(converted.lrc);
        setPlain("");
        setSource("Custom Apple TTML Override");
        if (converted.romanizedLrc) setRoman(converted.romanizedLrc);
        else if (autoRoman && !corrected)
          setRoman(romanizeText(converted.lrc).text);
        return;
      }
    }
    setRaw(value);
    setPlain("");
    setSource("Custom Edited");
    if (autoRoman && !corrected) setRoman(romanizeText(value).text);
  }

  function autoGenerate() {
    if (!raw) {
      setMessage("Add original lyrics before romanization.");
      return;
    }
    setRoman(romanizeText(raw).text);
    setCorrected(false);
    setMessage("Generating phonetic romanization…");
    void romanizeLrcTextAsync(raw)
      .then((upgraded) => {
        if (upgraded && upgraded.trim()) {
          setRoman(upgraded);
          setMessage(
            "Romanization generated (Spotify-Karaoke phonetic engine).",
          );
        }
      })
      .catch(() => {});
  }

  async function importLocal() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    if (file.size > 250000) {
      setMessage("Lyric file too large (maximum 250 KB).");
      return;
    }
    try {
      const text = await file.text();
      if (text.includes("<p begin=")) {
        const converted = convertTtmlToEnhancedLrc(text);
        if (converted.lrc) {
          updateRaw(converted.lrc);
          if (converted.romanizedLrc) setRoman(converted.romanizedLrc);
          setSource(`Local File · TTML (${file.name})`);
          setSourceUrl("");
          setMessage("Imported word-synced TTML file " + file.name);
          return;
        }
      }
      if (parseLRC(text).length) {
        updateRaw(text);
        setSource(`Local File · LRC (${file.name})`);
        setSourceUrl("");
      } else {
        setPlain(text);
        setRaw("");
        setRoman("");
        setSource(`Local File · Plain Text (${file.name})`);
        setSourceUrl("");
      }
      setMessage("Imported " + file.name + " from your device.");
    } catch {
      setMessage("The lyric file could not be read.");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function estimatePlain() {
    const rows = plain
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 300);
    if (!rows.length) {
      setMessage("No untimed lines available.");
      return;
    }
    const interval =
      track?.duration && track.duration > 0
        ? Math.max(1, track.duration / rows.length)
        : 4;
    const lrc = rows
      .map((line, i) => {
        const t = i * interval;
        const mm = String.prototype.padStart.call(Math.floor(t / 60), 2, "0");
        const ss = (t % 60).toFixed(2).padStart(5, "0");
        return "[" + mm + ":" + ss + "]" + line;
      })
      .join("\n");
    setRaw(lrc);
    if (autoRoman && !corrected) setRoman(romanizeText(lrc).text);
    setPlain("");
    setSource(source + " · estimated timing");
    setMessage("Approximate line timestamps generated.");
  }

  function saveOverride() {
    if (!raw.trim()) {
      setMessage("Add or edit lyrics first before saving.");
      return;
    }
    onSaveCustomOverride?.(raw);
    if (track) {
      try {
        saveUserLyrics({
          title: track.title,
          artist: track.artist,
          album: track.album,
          duration: track.duration,
          original: raw,
          romanized: roman,
          language,
          rightsConfirmed: true,
          source: "Custom Override",
        });
      } catch {
        // Ignore local library duplicate issues
      }
    }
    setMessage("Custom lyrics override saved for this song.");
  }

  const lyricTime = effectiveLyricTime(time, offset, delay);
  const isPausedSession = Boolean(trackLoaded && !isPlaying);
  let idx = -1;
  const activeLineIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= lyricTime) {
      idx = i;
      const lEnd = computeNaturalLineEnd(lines[i], lines[i + 1]?.time);
      if (
        lines[i].text.trim().length > 0 &&
        lyricTime < lEnd &&
        !isPausedSession
      ) {
        activeLineIndices.push(i);
      }
    } else {
      break;
    }
  }
  const primaryIdx = activeLineIndices.length > 0 ? activeLineIndices[0] : idx;
  const candidate = primaryIdx >= 0 ? lines[primaryIdx] : undefined;
  const next = lines[idx + 1];
  const candidateEnd = useMemo(
    () =>
      candidate
        ? computeNaturalLineEnd(candidate, lines[primaryIdx + 1]?.time)
        : 0,
    [candidate, lines, primaryIdx],
  );

  // Do NOT hold previous lyrics during pause or instrumental music breaks!
  const isWithinVocalWindow = activeLineIndices.length > 0;
  const current = isWithinVocalWindow ? lines[activeLineIndices[0]] : undefined;
  const duetPartnerLine =
    activeLineIndices.length > 1 ? lines[activeLineIndices[1]] : undefined;
  const prevLine =
    isWithinVocalWindow && activeLineIndices[0] > 0
      ? lines[activeLineIndices[0] - 1]
      : undefined;
  const prevRom =
    activeLineIndices[0] > 0 ? romanLines[activeLineIndices[0] - 1]?.text : "";
  const rom =
    activeLineIndices.length > 0
      ? romanLines[activeLineIndices[0]]?.text || ""
      : "";
  const nextRom = romanLines[idx + 1]?.text || "";

  const hasWordTags = useMemo(
    () =>
      lines.some((l) => l.words && l.words.some((w) => w.timing === "sourced")),
    [lines],
  );
  const currentHasWordSync = Boolean(
    current?.words &&
      current.words.length > 0 &&
      current.words.some((w) => w.timing === "sourced"),
  );

  // Prefer romanized lyrics if available unless the user explicitly selected 'original'
  const hasCurrentRoman = Boolean(
    current && hasDistinctRomanized(current.text, rom),
  );
  const preferRoman = mode !== "original" && hasCurrentRoman;
  const primaryLineText = current ? (preferRoman ? rom : current.text) : "";
  const secondaryLineText =
    current && mode === "both" && hasCurrentRoman ? current.text : "";

  const prevDisplay = prevLine
    ? mode !== "original" &&
      prevRom &&
      hasDistinctRomanized(prevLine.text, prevRom)
      ? prevRom
      : prevLine.text
    : "";
  const nextDisplay = next
    ? mode !== "original" && nextRom && hasDistinctRomanized(next.text, nextRom)
      ? nextRom
      : next.text
    : "";

  const lyricProviderInfo = useMemo(
    () =>
      describeLyricProvider(
        source,
        hasWordTags,
        lines.length > 0,
        Boolean(plain.trim()),
      ),
    [source, hasWordTags, lines.length, plain],
  );
  const audioSourceInfo = useMemo(
    () => describeAudioSource(track, trackLoaded),
    [track, trackLoaded],
  );

  // NEW LYRIC COLOUR MECHANISM:
  // 1. Entire line starts in a single uniform `baseColor` based on the active background.
  // 2. `sungColor` is applied sequentially (letter-by-letter for slow songs, word-by-word for fast songs)
  //    only when real word-by-word sync is available.
  const { baseLineColor, sungAccentColor } = useMemo(() => {
    if (
      albumArtPalette &&
      (lyricColorMode === "album" ||
        (lyricColorMode === "auto" && isVideoBackground))
    ) {
      return {
        baseLineColor: albumArtPalette.baseColor,
        sungAccentColor: albumArtPalette.sungColor,
      };
    }
    const scheduledScene =
      storyboard.find((s) => lyricTime >= s.start && lyricTime < s.end)?.id ||
      activeSceneId;
    const resolvedSceneId = byId[scheduledScene]
      ? scheduledScene
      : "holographic-tide";
    const palette = resolveThemePalette(
      resolvedSceneId,
      themePalettes?.[resolvedSceneId],
    );
    const customOverride =
      lyricColorMode !== "auto"
        ? LYRIC_COLOR_MAP[lyricColorMode].main
        : undefined;
    const { baseColor, sungColor } = computeBackgroundAdaptiveLyricColors(
      palette.background,
      palette.foreground,
      palette.accent,
      customOverride,
    );
    return { baseLineColor: baseColor, sungAccentColor: sungColor };
  }, [
    lyricColorMode,
    albumArtPalette,
    isVideoBackground,
    storyboard,
    lyricTime,
    activeSceneId,
    themePalettes,
  ]);

  // Only build word-by-word tokens when REAL sourced word-sync is available for this line!
  // Never predict/estimate word sync when only line-synced lyrics are available.
  const activeSourcedWords = useMemo<TimedWord[]>(() => {
    if (!current || !currentHasWordSync || !current.words) return [];
    if (!preferRoman) return current.words;
    const romTokens = rom.trim().split(/\s+/).filter(Boolean);
    if (romTokens.length === current.words.length) {
      return current.words.map((w, i) => ({ ...w, text: romTokens[i] }));
    }
    const firstStart = current.words[0].start;
    const lastEnd = current.words[current.words.length - 1].end;
    const totalSpan = Math.max(0.2, lastEnd - firstStart);
    const totalChars = romTokens.reduce((s, t) => s + t.length, 0) || 1;
    let cursor = 0;
    return romTokens.map((token) => {
      const start = firstStart + (totalSpan * cursor) / totalChars;
      cursor += token.length;
      const end = firstStart + (totalSpan * cursor) / totalChars;
      return { text: token, start, end, timing: "sourced" as const };
    });
  }, [current, currentHasWordSync, preferRoman, rom]);

  const activeFillPace = useMemo<"letter" | "word" | "line">(() => {
    if (!currentHasWordSync || activeSourcedWords.length === 0) return "line";
    return resolveLyricFillPace(activeSourcedWords, bpm, lyricFillPaceMode);
  }, [currentHasWordSync, activeSourcedWords, bpm, lyricFillPaceMode]);

  // Split long lines into multiple balanced lines (both for word-synced and line-synced)
  const activeWordRows = useMemo(
    () => splitWordsIntoBalancedRows(activeSourcedWords, 36, 6),
    [activeSourcedWords],
  );
  const activeLineRows = useMemo(
    () => splitLyricIntoBalancedLines(primaryLineText, 36, 6),
    [primaryLineText],
  );
  const secondaryLineRows = useMemo(
    () => splitLyricIntoBalancedLines(secondaryLineText, 42, 7),
    [secondaryLineText],
  );

  // Proportional lyric font scale (50% to 180%, default 100%)
  const effectiveScale = Math.max(
    0.5,
    Math.min(
      1.8,
      Number.isFinite(fontScale)
        ? fontScale
        : (minFontSize / 26 + maxFontSize / 88) * 0.5,
    ),
  );
  const fontScalePct = Math.round(effectiveScale * 100);
  const stageFontSizeCss = `calc(${effectiveScale.toFixed(2)} * clamp(15px, 2.6vw, 28px))`;
  const handleScalePctChange = (pct: number) => {
    const clampedPct = Math.max(50, Math.min(180, Math.round(pct)));
    const nextScale = clampedPct / 100;
    onFontScaleChange?.(nextScale);
    onMinFontSizeChange?.(
      Math.max(16, Math.min(72, Math.round(26 * nextScale))),
    );
    onMaxFontSizeChange?.(
      Math.max(32, Math.min(130, Math.round(88 * nextScale))),
    );
  };

  // Instrumental interlude indicator when between vocal lines
  const interludeProgress = useMemo(() => {
    if (!lines.length || isPausedSession) return null;
    if (
      idx === -1 &&
      lines[0].time >= 1.5 &&
      lyricTime >= 0 &&
      lyricTime < lines[0].time
    ) {
      return Math.max(0, Math.min(1, lyricTime / lines[0].time));
    }
    if (
      candidate &&
      next &&
      lyricTime >= candidateEnd &&
      lyricTime < next.time
    ) {
      const gap = Math.max(0.2, next.time - candidateEnd);
      return Math.max(0, Math.min(1, (lyricTime - candidateEnd) / gap));
    }
    return null;
  }, [lines, idx, candidate, next, candidateEnd, lyricTime, isPausedSession]);

  const mappingControls = (
    <div className="song-lyrics-mapping">
      <h3>Lyrics timing</h3>
      <label>
        Song delay (sec)
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            className="upload-button"
            aria-label="Decrease lyric delay 0.25s"
            style={{ padding: "6px 8px", minHeight: 34 }}
            onClick={() => {
              const next = clampLyricDelay(delay - 0.25);
              setDelayDraft(String(next));
              onDelayChange(next);
            }}
          >
            −0.25
          </button>
          <button
            type="button"
            className="upload-button"
            aria-label="Flip lyric delay sign"
            title="Toggle negative / positive (− / +)"
            style={{ padding: "6px 8px", minHeight: 34 }}
            onClick={() => {
              if (delay === 0) {
                setDelayDraft("-");
              } else {
                const flipped = clampLyricDelay(-delay);
                setDelayDraft(String(flipped));
                onDelayChange(flipped);
              }
            }}
          >
            ±
          </button>
          <input
            aria-label="Lyrics delay seconds"
            type="text"
            inputMode="decimal"
            placeholder="-1.50"
            value={delayDraft}
            onChange={(e) => {
              const val = e.target.value.replace(/−/g, "-");
              if (!/^-?\d*\.?\d*$/.test(val)) return;
              setDelayDraft(val);
              if (val !== "" && val !== "-" && val !== "-." && val !== ".") {
                const num = Number(val);
                if (Number.isFinite(num)) onDelayChange(clampLyricDelay(num));
              }
            }}
            onBlur={() => {
              const normalized = delayDraft.trim().replace(/−/g, "-");
              const num = Number(normalized);
              if (!normalized || normalized === "-" || !Number.isFinite(num)) {
                setDelayDraft(String(delay));
              } else {
                const clamped = clampLyricDelay(num);
                setDelayDraft(String(clamped));
                onDelayChange(clamped);
              }
            }}
            style={{ width: 76, textAlign: "center" }}
          />
          <button
            type="button"
            className="upload-button"
            aria-label="Increase lyric delay 0.25s"
            style={{ padding: "6px 8px", minHeight: 34 }}
            onClick={() => {
              const next = clampLyricDelay(delay + 0.25);
              setDelayDraft(String(next));
              onDelayChange(next);
            }}
          >
            +0.25
          </button>
        </div>
      </label>
      <p className="quiet-status">
        Positive delays lyrics; negative advances them.
      </p>
      <button
        type="button"
        className="text-button"
        onClick={onToggleCustomEdit}
        aria-expanded={customEditOpen}
        disabled={!track}
      >
        {customEditOpen ? "Close editor" : "Edit or import lyrics"}
      </button>
      {plain && !lines.length && (
        <div className="plain-lyrics-fallback">
          <textarea
            rows={4}
            readOnly
            value={plain}
            aria-label="Untimed lyrics"
            className="plain-preview"
          />
          <button className="upload-button" onClick={estimatePlain}>
            Create approximate timestamps
          </button>
        </div>
      )}

      {customEditOpen && (
        <div className="lyrics-editor">
          <label>
            Lyrics (LRC / TTML)
            <textarea
              rows={7}
              value={raw}
              onChange={(e) => updateRaw(e.target.value)}
              placeholder="[00:12.50]<00:12.50>Word <00:13.00>synced <00:13.50>line"
            />
          </label>
          <label>
            Romanization (editable)
            <textarea
              rows={7}
              value={roman}
              onChange={(e) => {
                setRoman(e.target.value);
                setCorrected(true);
              }}
              placeholder="Auto-generated or corrected Romanized lyrics"
            />
          </label>
          <div className="editor-actions">
            <input
              className="visually-hidden"
              ref={fileRef}
              type="file"
              accept=".lrc,.ttml,.xml,.txt,text/plain"
              aria-label="Import LRC or TTML file"
              onChange={() => void importLocal()}
            />
            <button
              className="upload-button"
              onClick={() => fileRef.current?.click()}
            >
              Import LRC / TTML
            </button>

            <button className="upload-button" onClick={autoGenerate}>
              Romanize locally
            </button>
            <button className="upload-button" onClick={saveOverride}>
              Save lyrics for current song
            </button>
            <button
              className="player-remove"
              onClick={() => {
                setRaw("");
                setRoman("");
                setPlain("");
                setSource("Cleared");
              }}
            >
              Clear
            </button>
          </div>
          <label className="rights-check">
            <input
              type="checkbox"
              checked={autoRoman}
              onChange={(e) => setAutoRoman(e.target.checked)}
            />
            Automatically Romanize non-Latin scripts
          </label>
        </div>
      )}

      {message && (
        <p className="quiet-status" role="status">
          {message}
        </p>
      )}
      <details className="disclosure">
        <summary>Lyrics preview & source</summary>
        {/* Source Attribution Bar: Displays both Lyrics Provider and Audio Source for the active song */}
        <div
          className="lyric-source-bar"
          aria-label="Active song lyrics provider and audio source"
        >
          <div className="lyric-source-card">
            <span className="lyric-source-label">LYRICS PROVIDER</span>
            <div className="lyric-source-main">
              <strong className="lyric-provider-badge">
                {lyricProviderInfo.providerName}
              </strong>
              <span
                className={`lyric-sync-tag ${hasWordTags ? "word-sync" : "line-sync"}`}
              >
                {lyricProviderInfo.syncMode}
              </span>
              {sourceUrl && (
                <a
                  className="lyric-source-link"
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Verify Source ↗
                </a>
              )}
            </div>
            <small className="lyric-source-sub">
              {lyricProviderInfo.detail}
            </small>
          </div>

          <div className="lyric-source-card">
            <span className="lyric-source-label">AUDIO SOURCE</span>
            <div className="lyric-source-main">
              <strong className="audio-provider-badge">
                {audioSourceInfo.providerName}
              </strong>
              <span
                className={`lyric-sync-tag ${audioSourceInfo.isLocal ? "local-audio" : "online-audio"}`}
              >
                {audioSourceInfo.isLocal
                  ? "Local Device File"
                  : "Full Studio Stream"}
              </span>
              {audioSourceInfo.sourceUrl && (
                <a
                  className="lyric-source-link"
                  href={audioSourceInfo.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Track ↗
                </a>
              )}
            </div>
            <small className="lyric-source-sub">{audioSourceInfo.detail}</small>
          </div>
        </div>

        <div className="lyric-display spicy-lyric-stage">
          <div className="spicy-stage-badges">
            <span title={`Lyrics Provider: ${lyricProviderInfo.detail}`}>
              Lyrics: <b>{lyricProviderInfo.providerName}</b> (
              {lyricProviderInfo.syncMode})
            </span>
            <span title={`Audio Source: ${audioSourceInfo.detail}`}>
              Audio: <b>{audioSourceInfo.providerName}</b>
            </span>
          </div>
          {prevDisplay && (
            <small className="spicy-prev-line">
              {splitLyricIntoBalancedLines(prevDisplay, 44, 8).join(" · ")}
            </small>
          )}
          {interludeProgress !== null && (
            <div
              className="spicy-interlude-dots"
              aria-label="Instrumental interlude"
            >
              {[0, 1, 2].map((dotIdx) => {
                const dotFill = Math.max(
                  0,
                  Math.min(1, interludeProgress * 3 - dotIdx),
                );
                return (
                  <span
                    key={dotIdx}
                    className={"spicy-dot " + (dotFill > 0.1 ? "active" : "")}
                    style={{
                      opacity: 0.28 + dotFill * 0.72,
                      transform: `scale(${0.88 + dotFill * 0.28})`,
                      backgroundColor: sungAccentColor,
                    }}
                  />
                );
              })}
            </div>
          )}
          {current ? (
            <>
              {currentHasWordSync ? (
                <div
                  className="spicy-word-multiline"
                  role="region"
                  aria-label="Word-synced lyrics"
                >
                  {activeWordRows.map((rowWords, rowIdx) => (
                    <p
                      className="spicy-word-line"
                      key={"row-" + rowIdx}
                      style={{
                        color: baseLineColor,
                        fontSize: stageFontSizeCss,
                      }}
                    >
                      {rowWords.map((w, wIdx) => {
                        const dur = Math.max(0.05, w.end - w.start);
                        const rawProg = (lyricTime - w.start) / dur;
                        const prog = Math.max(0, Math.min(1, rawProg));
                        const isSpokenStart = lyricTime >= w.start;
                        const isSpokenEnd = lyricTime >= w.end;
                        const state = isSpokenEnd
                          ? "sung"
                          : isSpokenStart
                            ? "active"
                            : "upcoming";

                        if (activeFillPace === "letter") {
                          // Slow song: change colour of letters one by one as it is said
                          const chars = Array.from(w.text);
                          const sungLetters = !isSpokenStart
                            ? 0
                            : isSpokenEnd
                              ? chars.length
                              : Math.max(
                                  1,
                                  Math.min(
                                    chars.length,
                                    Math.ceil(prog * chars.length),
                                  ),
                                );
                          return (
                            <span
                              key={rowIdx + "-" + wIdx + "-" + w.start}
                              className={`spicy-word ${state}`}
                              style={{ color: baseLineColor }}
                            >
                              {chars.map((ch, cIdx) => {
                                const isLetterSung = cIdx < sungLetters;
                                return (
                                  <span
                                    key={cIdx}
                                    style={{
                                      color: isLetterSung
                                        ? sungAccentColor
                                        : baseLineColor,
                                      textShadow: isLetterSung
                                        ? `0 0 14px ${sungAccentColor}66`
                                        : undefined,
                                      transition: "color 70ms linear",
                                    }}
                                  >
                                    {ch}
                                  </span>
                                );
                              })}
                              {wIdx < rowWords.length - 1 ? " " : ""}
                            </span>
                          );
                        }

                        // Fast-paced song: change colour of words one by one as it is said
                        const wordColor = isSpokenStart
                          ? sungAccentColor
                          : baseLineColor;
                        return (
                          <span
                            key={rowIdx + "-" + wIdx + "-" + w.start}
                            className={`spicy-word ${state}`}
                            style={{
                              color: wordColor,
                              textShadow: isSpokenStart
                                ? `0 0 16px ${sungAccentColor}55`
                                : undefined,
                              transition: "color 80ms linear",
                            }}
                          >
                            {w.text}
                            {wIdx < rowWords.length - 1 ? " " : ""}
                          </span>
                        );
                      })}
                    </p>
                  ))}
                </div>
              ) : (
                /* Line-synced only: entire line is a single uniform colour based on the background — NO word-by-word prediction */
                <div
                  className="spicy-word-multiline"
                  role="region"
                  aria-label="Line-synced lyrics"
                >
                  {activeLineRows.map((rowText, rowIdx) => (
                    <p
                      key={"line-row-" + rowIdx}
                      className="spicy-word-line spicy-line-synced"
                      style={{
                        color: baseLineColor,
                        fontSize: stageFontSizeCss,
                        textShadow: `0 0 16px ${baseLineColor}35`,
                      }}
                    >
                      {rowText}
                    </p>
                  ))}
                </div>
              )}
              {secondaryLineRows.length > 0 && (
                <div className="spicy-secondary-multiline">
                  {secondaryLineRows.map((secRow, sIdx) => (
                    <p key={"sec-" + sIdx} className="romanized">
                      {secRow}
                    </p>
                  ))}
                </div>
              )}
              {duetPartnerLine && (
                <div
                  className="spicy-duet-split"
                  role="region"
                  aria-label="Simultaneous dual-singer lyrics"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 16,
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: "1px solid rgba(255,255,255,0.12)",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      background: "rgba(56,189,248,0.08)",
                      border: "1px solid rgba(56,189,248,0.22)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        color: sungAccentColor,
                        marginBottom: 4,
                      }}
                    >
                      SINGER 1 (LEFT STAGE)
                    </div>
                    <div
                      style={{
                        color: baseLineColor,
                        fontWeight: 700,
                        fontSize: "0.95em",
                      }}
                    >
                      {primaryLineText}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      background: "rgba(255,209,102,0.08)",
                      border: "1px solid rgba(255,209,102,0.22)",
                      textAlign: "right",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        color: "#ffd166",
                        marginBottom: 4,
                      }}
                    >
                      SINGER 2 (RIGHT STAGE)
                    </div>
                    <div
                      style={{
                        color: baseLineColor,
                        fontWeight: 700,
                        fontSize: "0.95em",
                      }}
                    >
                      {duetPartnerLine.text}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p>
              {isPausedSession
                ? "Playback paused — resume song to continue synchronized lyrics."
                : plain
                  ? 'Untimed lyrics loaded — click "Create approximate timestamps" below to synchronize.'
                  : lines.length
                    ? "Instrumental break · awaiting next vocal cue…"
                    : "Lyrics load automatically when you select a song from Stash Online Player or upload a local file."}
            </p>
          )}
          {nextDisplay && (
            <small className="spicy-next-line">
              UP NEXT ·{" "}
              {splitLyricIntoBalancedLines(nextDisplay, 44, 8).join(" / ")}
            </small>
          )}
        </div>
      </details>
    </div>
  );
  return (
    <>
      {mappingTarget
        ? createPortal(mappingControls, mappingTarget)
        : mappingControls}
      <section className="local-player lyrics-panel">
        <div className="lyrics-tools">
          <label>
            Lyrics display
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="both">Romanized + original</option>
              <option value="romanized">Romanized</option>
              <option value="original">Original</option>
            </select>
          </label>
          <label>
            Main lyric color
            <select
              aria-label="Main lyric text color"
              value={lyricColorMode}
              onChange={(e) =>
                setLyricColorMode(e.target.value as LyricColorMode)
              }
            >
              <option value="auto">Adaptive</option>
              {(
                Object.entries(LYRIC_COLOR_MAP) as [
                  Exclude<LyricColorMode, "auto">,
                  { label: string },
                ][]
              ).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Word-sync fill pace
            <select
              aria-label="Lyric fill pace"
              value={lyricFillPaceMode}
              onChange={(e) =>
                setLyricFillPaceMode(e.target.value as LyricFillPaceMode)
              }
            >
              <option value="auto">Automatic</option>
              <option value="letter">Letter by letter</option>
              <option value="word">Word by word</option>
            </select>
          </label>
          <label>
            Lyrics font size ({fontScalePct}%)
            <input
              aria-label="Lyrics font size scale"
              type="range"
              min="50"
              max="180"
              step="5"
              value={fontScalePct}
              onChange={(e) => handleScalePctChange(Number(e.target.value))}
            />
          </label>
          <label>
            Genre
            <select value={genre} onChange={(e) => setGenre(e.target.value)}>
              <option value="">Auto / unknown</option>
              {[
                "Ambient",
                "Cinematic",
                "Pop",
                "EDM",
                "Rock",
                "Hip-hop",
                "Ballad",
                "Classical",
              ].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
        </div>

        <div
          className="romanization-languages-box"
          aria-label="Romanization and supported languages"
          style={{
            marginTop: 12,
            padding: "12px 14px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 8,
            }}
          >
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                aria-label="Enable phonetic romanization"
                checked={autoRoman}
                onChange={(e) => setAutoRoman(e.target.checked)}
              />
              <span>Romanization</span>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="upload-button"
                onClick={() => {
                  setAutoRoman(true);
                  setEnabledRomanLangs([...ALL_ROMANIZATION_LANGUAGE_CODES]);
                }}
              >
                Enable all languages
              </button>
            </div>
          </div>
          <details className="disclosure">
            <summary>
              Languages <span>{enabledRomanLangs.length} enabled</span>
            </summary>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SUPPORTED_ROMANIZATION_LANGUAGES.map((lang) => {
                const isLangOn =
                  autoRoman && enabledRomanLangs.includes(lang.code);
                return (
                  <button
                    key={lang.code}
                    type="button"
                    role="switch"
                    aria-checked={isLangOn}
                    aria-label={`Romanize ${lang.name}`}
                    onClick={() => toggleRomanLang(lang.code)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      border: isLangOn
                        ? "1px solid #38bdf8"
                        : "1px solid rgba(255,255,255,0.14)",
                      background: isLangOn
                        ? "rgba(56,189,248,0.16)"
                        : "rgba(255,255,255,0.03)",
                      color: isLangOn ? "#e0f2fe" : "#94a3b8",
                      opacity: autoRoman ? 1 : 0.5,
                    }}
                  >
                    {lang.name} ·{" "}
                    {enabledRomanLangs.includes(lang.code) ? "ON" : "OFF"}
                  </button>
                );
              })}
            </div>
          </details>
        </div>
      </section>
    </>
  );
}
