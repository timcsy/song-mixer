import { ref, reactive, computed, onUnmounted, watch, type Ref } from 'vue';
import * as Tone from 'tone';
import { DEFAULT_VOLUMES, type TrackName, type TrackState } from '@/types/audio';

const API_BASE = '/api/v1';

export interface UseWebAudioOptions {
  jobId: string;
}

export interface UseWebAudioReturn {
  // State
  isLoading: Ref<boolean>;
  isPlaying: Ref<boolean>;
  currentTime: Ref<number>;
  duration: Ref<number>;
  tracks: Record<TrackName, TrackState>;
  error: Ref<string | null>;
  masterVolume: Ref<number>;

  // Actions
  loadTracks: () => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setVolume: (track: TrackName, volume: number) => void;
  setPitchShift: (semitones: number) => void;
  setMasterVolume: (volume: number) => void;

  // Computed
  isReady: Ref<boolean>;
  pitchShift: Ref<number>;
}

// Check Web Audio API support
const isWebAudioSupported = (): boolean => {
  return typeof window !== 'undefined' &&
    (typeof AudioContext !== 'undefined' || typeof (window as any).webkitAudioContext !== 'undefined');
};

export function useWebAudio(options: UseWebAudioOptions): UseWebAudioReturn {
  const { jobId } = options;

  // State
  const isLoading = ref(true);
  const isPlaying = ref(false);
  const currentTime = ref(0);
  const duration = ref(0);
  const error = ref<string | null>(null);
  const pitchShift = ref(0);
  const masterVolume = ref(1); // 主音量 (0-1)

  // Check browser compatibility
  if (!isWebAudioSupported()) {
    error.value = '您的瀏覽器不支援 Web Audio API，請使用 Chrome、Firefox 或 Safari 最新版本';
    isLoading.value = false;
  }

  // Track states
  const tracks = reactive<Record<TrackName, TrackState>>({
    drums: { name: 'drums', volume: DEFAULT_VOLUMES.drums, loaded: false, error: null },
    bass: { name: 'bass', volume: DEFAULT_VOLUMES.bass, loaded: false, error: null },
    other: { name: 'other', volume: DEFAULT_VOLUMES.other, loaded: false, error: null },
    vocals: { name: 'vocals', volume: DEFAULT_VOLUMES.vocals, loaded: false, error: null },
  });

  // Tone.js instances
  let players: Record<TrackName, Tone.Player | null> = {
    drums: null,
    bass: null,
    other: null,
    vocals: null,
  };

  let gainNodes: Record<TrackName, Tone.Gain | null> = {
    drums: null,
    bass: null,
    other: null,
    vocals: null,
  };

  let pitchShifter: Tone.PitchShift | null = null;
  let masterGain: Tone.Gain | null = null;
  let animationFrame: number | null = null;

  // Computed
  const isReady = computed(() => {
    return Object.values(tracks).some(t => t.loaded);
  });

  // Track URL helper
  const getTrackUrl = (track: TrackName): string => {
    return `${API_BASE}/jobs/${jobId}/tracks/${track}`;
  };

  // Update current time during playback
  const updateTime = () => {
    if (isPlaying.value && players.drums) {
      const transport = Tone.getTransport();
      currentTime.value = transport.seconds;
      animationFrame = requestAnimationFrame(updateTime);
    }
  };

  // Load all tracks
  const loadTracks = async (): Promise<void> => {
    // Early return if browser doesn't support Web Audio
    if (!isWebAudioSupported()) {
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      // Ensure AudioContext is started
      await Tone.start();

      // Create master gain (主音量控制)
      masterGain = new Tone.Gain(masterVolume.value).toDestination();

      // Create pitch shifter (shared by all tracks)
      pitchShifter = new Tone.PitchShift({
        pitch: pitchShift.value,
        windowSize: 0.1,
        delayTime: 0,
      }).connect(masterGain);

      // Fetch tracks info first
      const response = await fetch(`${API_BASE}/jobs/${jobId}/tracks`);
      if (!response.ok) {
        throw new Error('無法取得音軌資訊');
      }
      const tracksInfo = await response.json();
      duration.value = tracksInfo.duration;

      // Load each available track in parallel
      const trackNames: TrackName[] = ['drums', 'bass', 'other', 'vocals'];
      const loadPromises = trackNames.map((trackName) => {
        if (!tracksInfo.tracks.includes(trackName)) {
          tracks[trackName].error = '音軌不存在';
          return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
          try {
            // Create gain node for volume control
            const gain = new Tone.Gain(tracks[trackName].volume);
            gain.connect(pitchShifter!);
            gainNodes[trackName] = gain;

            // Create player with Promise-based loading
            const player = new Tone.Player({
              url: getTrackUrl(trackName),
              onload: () => {
                tracks[trackName].loaded = true;
                resolve();
              },
              onerror: (err) => {
                tracks[trackName].error = `載入失敗: ${err}`;
                resolve(); // Still resolve to not block other tracks
              },
            });

            player.connect(gain);
            player.sync().start(0);
            players[trackName] = player;
          } catch (err) {
            tracks[trackName].error = `載入失敗: ${err}`;
            resolve();
          }
        });
      });

      await Promise.all(loadPromises);

      // Check if at least one track loaded
      if (!Object.values(tracks).some(t => t.loaded)) {
        throw new Error('無法載入任何音軌');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '載入音軌時發生錯誤';
    } finally {
      isLoading.value = false;
    }
  };

  // Play
  const play = async (): Promise<void> => {
    if (!isReady.value) return;

    try {
      await Tone.start();
      const transport = Tone.getTransport();
      transport.start();
      isPlaying.value = true;
      updateTime();
    } catch (err) {
      error.value = '播放失敗';
    }
  };

  // Pause
  const pause = (): void => {
    const transport = Tone.getTransport();
    transport.pause();
    isPlaying.value = false;
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  };

  // Stop
  const stop = (): void => {
    const transport = Tone.getTransport();
    transport.stop();
    transport.seconds = 0;
    currentTime.value = 0;
    isPlaying.value = false;
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  };

  // Seek
  const seek = (time: number): void => {
    const transport = Tone.getTransport();
    const wasPlaying = isPlaying.value;

    if (wasPlaying) {
      transport.pause();
    }

    transport.seconds = Math.max(0, Math.min(time, duration.value));
    currentTime.value = transport.seconds;

    if (wasPlaying) {
      transport.start();
    }
  };

  // Set volume for a track
  const setVolume = (track: TrackName, volume: number): void => {
    const clampedVolume = Math.max(0, Math.min(2, volume));
    tracks[track].volume = clampedVolume;

    const gain = gainNodes[track];
    if (gain) {
      gain.gain.rampTo(clampedVolume, 0.05);
    }
  };

  // Set pitch shift (semitones)
  const setPitchShift = (semitones: number): void => {
    const clampedSemitones = Math.max(-12, Math.min(12, semitones));
    pitchShift.value = clampedSemitones;

    if (pitchShifter) {
      pitchShifter.pitch = clampedSemitones;
    }
  };

  // Set master volume (0-1)
  const setMasterVolume = (volume: number): void => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    masterVolume.value = clampedVolume;

    if (masterGain) {
      masterGain.gain.rampTo(clampedVolume, 0.05);
    }
  };

  // Cleanup on unmount
  onUnmounted(() => {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }

    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();

    // Dispose all Tone.js objects
    Object.values(players).forEach(player => player?.dispose());
    Object.values(gainNodes).forEach(gain => gain?.dispose());
    pitchShifter?.dispose();
    masterGain?.dispose();

    players = { drums: null, bass: null, other: null, vocals: null };
    gainNodes = { drums: null, bass: null, other: null, vocals: null };
    pitchShifter = null;
    masterGain = null;
  });

  return {
    // State
    isLoading,
    isPlaying,
    currentTime,
    duration,
    tracks,
    error,
    masterVolume,

    // Actions
    loadTracks,
    play,
    pause,
    stop,
    seek,
    setVolume,
    setPitchShift,
    setMasterVolume,

    // Computed
    isReady,
    pitchShift,
  };
}
