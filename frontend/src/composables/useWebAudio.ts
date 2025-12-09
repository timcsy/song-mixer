import { ref, reactive, computed, onUnmounted, type Ref } from 'vue';
import * as Tone from 'tone';
import { DEFAULT_VOLUMES, type TrackName, type TrackState } from '@/types/audio';
import type { SongRecord } from '@/types/storage';
import { int16BufferToStereoFloat32 } from '@/utils/format';
import { storageService } from '@/services/storageService';

export interface UseWebAudioOptions {
  /** 後端 job ID（Docker 模式） */
  jobId?: string;
  /** 本地歌曲資料（純靜態模式） */
  songRecord?: SongRecord;
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
  const { jobId, songRecord } = options;

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
  let timeUpdateInterval: number | null = null;

  // 用於背景播放的隱藏 audio 元素（播放靜音音訊來防止瀏覽器暫停 AudioContext）
  let silentAudio: HTMLAudioElement | null = null;

  // 設置背景播放支援（使用 MediaStream 連接到 audio 元素）
  let mediaStreamDestination: MediaStreamAudioDestinationNode | null = null;

  const setupBackgroundPlayback = async () => {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;

      // 創建一個持續播放極小音量噪音的 oscillator 連接到 MediaStreamDestination
      mediaStreamDestination = rawContext.createMediaStreamDestination();

      // 創建一個極低頻率、極小音量的 oscillator（人耳幾乎聽不到）
      const oscillator = rawContext.createOscillator();
      const gainNode = rawContext.createGain();
      oscillator.frequency.value = 1; // 1Hz - 人耳聽不到的頻率
      gainNode.gain.value = 0.001; // 極小音量
      oscillator.connect(gainNode);
      gainNode.connect(mediaStreamDestination);
      oscillator.start();

      // 創建 audio 元素並連接到 MediaStream
      silentAudio = document.createElement('audio');
      silentAudio.id = 'background-audio-keepalive';
      silentAudio.srcObject = mediaStreamDestination.stream;
      silentAudio.volume = 1; // 需要有音量才能讓瀏覽器認為在播放

      // 將 audio 元素加入 DOM
      silentAudio.style.display = 'none';
      document.body.appendChild(silentAudio);

      // 監聯聽 audio 元素的狀態
      // 注意：只有在 isPlaying 為 true 時才恢復，避免用戶主動暫停後又被自動恢復
      silentAudio.addEventListener('pause', async () => {
        // 只有當用戶想要播放（isPlaying.value === true）但 Transport 被暫停時才恢復
        // 這表示是瀏覽器強制暫停，而不是用戶主動暫停
        if (!isPlaying.value) {
          return;
        }

        const transport = Tone.getTransport();
        if (transport.state === 'paused' || transport.state === 'stopped') {
          try {
            // 先恢復 AudioContext
            if (rawContext.state !== 'running') {
              await rawContext.resume();
            }

            // 強制恢復 Transport
            transport.start();

            // 重新播放 audio 元素
            if (silentAudio) {
              await silentAudio.play();
            }
          } catch (e) {
            // 忽略恢復失敗
          }
        }
      });

      return true;
    } catch (e) {
      console.warn('無法設置背景播放:', e);
      return false;
    }
  };

  // Computed
  const isReady = computed(() => {
    return Object.values(tracks).some(t => t.loaded);
  });

  // 本地歌曲資料（從 IndexedDB 載入）
  let localSongRecord = ref<SongRecord | null>(songRecord ?? null);

  // Update current time during playback
  const updateTime = () => {
    if (isPlaying.value && players.drums) {
      const transport = Tone.getTransport();
      currentTime.value = transport.seconds;
      // 只在頁面可見時使用 requestAnimationFrame
      if (!document.hidden) {
        animationFrame = requestAnimationFrame(updateTime);
      }
    }
  };

  // 處理 AudioContext 狀態變化（背景播放支援）
  const handleAudioContextStateChange = async () => {
    // 僅用於監控，不需要 log
  };

  // 處理頁面可見性變化（背景播放支援）
  const handleVisibilityChange = async () => {
    if (document.hidden) {
      // 頁面隱藏 - 停止 requestAnimationFrame（音訊會在背景繼續播放）
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }

      // 使用 setInterval 更新時間（背景中可能不執行）
      if (isPlaying.value && !timeUpdateInterval) {
        timeUpdateInterval = window.setInterval(() => {
          if (isPlaying.value && players.drums) {
            currentTime.value = Tone.getTransport().seconds;
          }
        }, 100);
      }

      // 確保 AudioContext 和 Transport 繼續運行
      // 使用持續的 interval 來恢復音訊（瀏覽器可能會多次嘗試暫停）
      if (isPlaying.value) {
        const keepAliveInterval = setInterval(async () => {
          // 如果頁面變成可見或用戶暫停，停止 interval
          if (!document.hidden || !isPlaying.value) {
            clearInterval(keepAliveInterval);
            return;
          }

          const rawContext = Tone.getContext().rawContext as AudioContext;
          const transport = Tone.getTransport();

          try {
            if (rawContext.state === 'suspended') {
              await rawContext.resume();
            }

            if (transport.state !== 'started') {
              transport.start();
            }

            if (silentAudio && silentAudio.paused) {
              await silentAudio.play();
            }
          } catch (e) {
            // 忽略錯誤
          }
        }, 200); // 每 200ms 檢查一次
      }
    } else {
      // 頁面可見 - 恢復 UI 更新
      if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
        timeUpdateInterval = null;
      }

      // 同步當前時間（背景播放期間時間已經前進）
      if (isPlaying.value) {
        currentTime.value = Tone.getTransport().seconds;
        updateTime();
      }
    }
  };

  // Cleanup function to properly dispose all audio resources
  const cleanup = () => {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }

    // 清理背景播放 interval
    if (timeUpdateInterval) {
      clearInterval(timeUpdateInterval);
      timeUpdateInterval = null;
    }

    // 移除頁面可見性事件監聽器
    document.removeEventListener('visibilitychange', handleVisibilityChange);

    // 移除 AudioContext 狀態變化事件監聯聽器
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      rawContext.removeEventListener('statechange', handleAudioContextStateChange);
    } catch (e) {
      // 忽略錯誤
    }

    // 清理背景播放音訊元素
    if (silentAudio) {
      silentAudio.pause();
      silentAudio.srcObject = null;
      if (silentAudio.parentNode) {
        silentAudio.parentNode.removeChild(silentAudio);
      }
      silentAudio = null;
    }
    if (mediaStreamDestination) {
      mediaStreamDestination.disconnect();
      mediaStreamDestination = null;
    }

    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    // 重置 Transport 時間，避免影響下一個歌曲
    transport.seconds = 0;

    // Dispose all Tone.js objects
    Object.values(players).forEach(player => {
      if (player) {
        player.unsync(); // 從 Transport 解除同步
        player.stop();
        player.dispose();
      }
    });
    Object.values(gainNodes).forEach(gain => gain?.dispose());
    pitchShifter?.dispose();
    masterGain?.dispose();

    players = { drums: null, bass: null, other: null, vocals: null };
    gainNodes = { drums: null, bass: null, other: null, vocals: null };
    pitchShifter = null;
    masterGain = null;

    // 重置狀態
    isPlaying.value = false;
    currentTime.value = 0;
  };

  /**
   * 將 ArrayBuffer (Int16 立體聲交錯) 轉換為 AudioBuffer
   */
  const arrayBufferToAudioBuffer = async (
    buffer: ArrayBuffer,
    sampleRate: number
  ): Promise<AudioBuffer> => {
    // 從 Int16 格式還原為 Float32
    const { left: leftData, right: rightData } = int16BufferToStereoFloat32(buffer);

    const audioCtx = Tone.getContext().rawContext as AudioContext;
    const audioBuffer = audioCtx.createBuffer(2, leftData.length, sampleRate);

    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);

    // 複製資料到 AudioBuffer
    left.set(leftData);
    right.set(rightData);

    return audioBuffer;
  };

  /**
   * 從 SongRecord（IndexedDB）載入音軌
   */
  const loadTracksFromSongRecord = async (): Promise<void> => {
    const record = localSongRecord.value;
    if (!record) return;

    duration.value = record.duration;

    const trackNames: TrackName[] = ['drums', 'bass', 'other', 'vocals'];
    const loadPromises = trackNames.map(async (trackName) => {
      try {
        const trackBuffer = record.tracks[trackName];
        if (!trackBuffer) {
          tracks[trackName].error = '音軌不存在';
          return;
        }

        // 將 ArrayBuffer 轉換為 AudioBuffer
        const audioBuffer = await arrayBufferToAudioBuffer(
          trackBuffer,
          record.sampleRate
        );

        // 建立 Gain 節點
        const gain = new Tone.Gain(tracks[trackName].volume);
        gain.connect(pitchShifter!);
        gainNodes[trackName] = gain;

        // 建立 Player 從 AudioBuffer
        const player = new Tone.Player().connect(gain);
        player.buffer = new Tone.ToneAudioBuffer(audioBuffer);
        player.sync().start(0);
        players[trackName] = player;

        tracks[trackName].loaded = true;
      } catch (err) {
        tracks[trackName].error = `載入失敗: ${err}`;
      }
    });

    await Promise.all(loadPromises);
  };

  /**
   * 從 IndexedDB 載入歌曲資料（透過 jobId）
   */
  const loadSongFromIndexedDB = async (): Promise<void> => {
    if (!jobId) return;

    await storageService.init();
    const song = await storageService.getSong(jobId);
    if (!song) {
      throw new Error('找不到歌曲資料');
    }
    localSongRecord.value = song;
  };

  // Load all tracks
  const loadTracks = async (): Promise<void> => {
    // Early return if browser doesn't support Web Audio
    if (!isWebAudioSupported()) {
      return;
    }

    // 先清理之前的資源（如果有的話）
    cleanup();

    isLoading.value = true;
    error.value = null;

    try {
      // Ensure AudioContext is started
      await Tone.start();

      // 註冊頁面可見性變化事件（支援背景播放）
      document.addEventListener('visibilitychange', handleVisibilityChange);

      // 註冊 AudioContext 狀態變化事件
      const rawContext = Tone.getContext().rawContext as AudioContext;
      rawContext.addEventListener('statechange', handleAudioContextStateChange);

      // 設定 Media Session API（幫助瀏覽器識別這是媒體播放器）
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: localSongRecord.value?.title || '音樂混音器',
          artist: 'Song Mixer',
          album: 'Local Library',
        });

        navigator.mediaSession.setActionHandler('play', () => {
          play();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          pause();
        });
        navigator.mediaSession.setActionHandler('stop', () => {
          stop();
        });
      }

      // Create master gain (主音量控制)
      masterGain = new Tone.Gain(masterVolume.value).toDestination();

      // Create pitch shifter (shared by all tracks)
      // windowSize 越小延遲越低，但音質可能略差
      pitchShifter = new Tone.PitchShift({
        pitch: pitchShift.value,
        windowSize: 0.05,
        delayTime: 0,
      }).connect(masterGain);

      // 根據來源載入音軌
      // 優先使用已提供的 songRecord，否則從 IndexedDB 載入
      if (!localSongRecord.value && jobId) {
        await loadSongFromIndexedDB();
      }

      if (localSongRecord.value) {
        await loadTracksFromSongRecord();
      } else {
        throw new Error('必須提供 jobId 或 songRecord');
      }

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

      // 啟動背景播放支援
      if (!silentAudio) {
        await setupBackgroundPlayback();
      }
      if (silentAudio) {
        try {
          await silentAudio.play();
        } catch (e) {
          // 忽略背景音訊播放失敗
        }
      }

      // 更新 Media Session 播放狀態
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }

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

    // 暫停靜音音訊
    if (silentAudio) {
      silentAudio.pause();
    }

    // 更新 Media Session 播放狀態
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }

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

    // 停止靜音音訊
    if (silentAudio) {
      silentAudio.pause();
      silentAudio.currentTime = 0;
    }

    // 更新 Media Session 播放狀態
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
    }
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
    cleanup();
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
