/** Same sign convention as lyrics: + delays presentation, - advances it. */
export function videoSyncTarget(audioTime: number, videoDelaySeconds = 0, separateAudio = true) {
  const time = Number.isFinite(audioTime) ? Math.max(0, audioTime) : 0;
  const delay = separateAudio && Number.isFinite(videoDelaySeconds) ? Math.max(-300, Math.min(300, videoDelaySeconds)) : 0;
  return { time: Math.max(0, time - delay), waiting: separateAudio && time < delay };
}
