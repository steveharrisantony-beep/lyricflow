import {useEffect,useState} from 'react';

export type ThemeSearchState = {lastRecording: string; consecutiveThemeSongs: number; mode: 'theme'|'video'};

/** Count distinct actual song transitions, not playback ticks, re-renders or advertisements. */
export function advanceThemeSearchState(
  previous: ThemeSearchState,
  recording: string,
  mode: 'theme'|'video',
  isMusic = true
): ThemeSearchState {
  if (mode === 'video') {
    return previous.mode === 'video' && previous.consecutiveThemeSongs === 0
      ? previous
      : {lastRecording:'',consecutiveThemeSongs:0,mode:'video'};
  }
  if (!isMusic || !recording) return previous;
  if (previous.mode !== 'theme') {
    return {lastRecording:recording,consecutiveThemeSongs:1,mode:'theme'};
  }
  if (previous.lastRecording === recording) return previous;
  return {
    lastRecording:recording,
    consecutiveThemeSongs:previous.consecutiveThemeSongs + 1,
    mode:'theme',
  };
}

/** Block the fourth consecutive song in Themes mode before the network effect runs. */
export function shouldSuspendAutoVideoSearch(
  state: ThemeSearchState,
  recording: string,
  mode: 'theme'|'video',
  isMusic = true
): boolean {
  return mode === 'theme' &&
    advanceThemeSearchState(state, recording, mode, isMusic).consecutiveThemeSongs > 3;
}

export function useThemeVideoSearchGate(recording: string, mode: 'theme'|'video', isMusic: boolean) {
  const [state,setState]=useState<ThemeSearchState>({
    lastRecording:'',consecutiveThemeSongs:0,mode:'video',
  });
  const suspended=shouldSuspendAutoVideoSearch(state,recording,mode,isMusic);
  useEffect(()=>{
    setState(previous=>advanceThemeSearchState(previous,recording,mode,isMusic));
  },[recording,mode,isMusic]);
  return {suspended,consecutiveThemeSongs:advanceThemeSearchState(state,recording,mode,isMusic).consecutiveThemeSongs};
}
