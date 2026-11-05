/** Limits silent/unstarted automatic background video retries. */
export const AUTO_VIDEO_START_TIMEOUT_MS = 8000;
export const AUTO_VIDEO_STALL_TIMEOUT_MS = 12000;
export const MAX_AUTO_VIDEO_RELOADS = 2;

export interface AutoVideoRecoveryConditions {
  hasAutoMatch: boolean;
  videoId: string | null | undefined;
  separateAudio: boolean;
  backgroundMode: 'theme' | 'video';
  audioPaused: boolean;
  hiddenVideo: boolean;
  adPlaying: boolean;
  searchPending: boolean;
  playerAllowed: boolean;
  awaitingVideoStart: boolean;
  videoEnded: boolean;
  pageVisible: boolean;
}

export function shouldMonitorAutoVideo(input: AutoVideoRecoveryConditions): boolean {
  return Boolean(input.hasAutoMatch && input.videoId && input.separateAudio &&
    input.backgroundMode === 'video' && !input.audioPaused && !input.hiddenVideo &&
    !input.adPlaying && !input.searchPending && input.playerAllowed &&
    !input.awaitingVideoStart && !input.videoEnded && input.pageVisible);
}
