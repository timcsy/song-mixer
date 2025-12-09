import { ref, watch, onUnmounted, type Ref } from 'vue';

export interface UseAudioSyncOptions {
  videoElement: Ref<HTMLVideoElement | null>;
  isPlaying: Ref<boolean>;
  currentTime: Ref<number>;
  duration: Ref<number>;
  play: () => Promise<void>;
  pause: () => void;
  seek: (time: number) => void;
}

export interface UseAudioSyncReturn {
  syncEnabled: Ref<boolean>;
  enableSync: () => void;
  disableSync: () => void;
}

/**
 * 同步影片元素與 Web Audio 播放
 *
 * 影片作為主控制器：
 * - 監聽影片的 play/pause/seek 事件
 * - Web Audio 跟隨影片時間
 */
export function useAudioSync(options: UseAudioSyncOptions): UseAudioSyncReturn {
  const { videoElement, isPlaying, currentTime, play, pause, seek } = options;

  const syncEnabled = ref(false);
  let isUserSeeking = false;

  // 處理頁面可見性變化 - 恢復 video 同步
  const handleVisibilityChange = async () => {
    if (!syncEnabled.value) return;
    const video = videoElement.value;
    if (!video) return;

    if (!document.hidden) {
      // 頁面可見 - 如果 audio 正在播放，同步 video 並繼續播放
      if (isPlaying.value && video.paused) {
        // 將 video 時間同步到 audio 當前時間
        video.currentTime = currentTime.value;
        video.muted = true;
        try {
          await video.play();
        } catch (e) {
          console.warn('無法恢復 video 播放:', e);
        }
      }
    }
  };

  // 影片事件處理
  const handlePlay = async () => {
    if (!syncEnabled.value) return;
    if (!isPlaying.value) {
      await play();
    }
  };

  const handlePause = () => {
    if (!syncEnabled.value) return;
    // 如果頁面隱藏，不要暫停音訊（支援背景播放）
    if (document.hidden) return;
    // 如果正在 seeking，不要暫停音訊
    if (isUserSeeking) return;
    if (isPlaying.value) {
      pause();
    }
  };

  const handleSeeking = () => {
    isUserSeeking = true;
  };

  const handleSeeked = () => {
    if (!syncEnabled.value) return;
    const video = videoElement.value;
    if (video && isUserSeeking) {
      seek(video.currentTime);
      isUserSeeking = false;
    }
  };

  const handleTimeUpdate = () => {
    if (!syncEnabled.value) return;
    const video = videoElement.value;
    if (!video || isUserSeeking) return;

    // 如果頁面隱藏或 video 正在 seeking，不進行時間同步
    if (document.hidden || video.seeking) return;

    // 檢查時間差，若差異過大則同步
    const timeDiff = Math.abs(video.currentTime - currentTime.value);
    if (timeDiff > 0.3 && isPlaying.value && !video.paused) {
      seek(video.currentTime);
    }
  };

  // 綁定影片事件
  const bindVideoEvents = (video: HTMLVideoElement) => {
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('timeupdate', handleTimeUpdate);
  };

  // 移除影片事件
  const unbindVideoEvents = (video: HTMLVideoElement) => {
    video.removeEventListener('play', handlePlay);
    video.removeEventListener('pause', handlePause);
    video.removeEventListener('seeking', handleSeeking);
    video.removeEventListener('seeked', handleSeeked);
    video.removeEventListener('timeupdate', handleTimeUpdate);
  };

  // 啟用同步
  const enableSync = () => {
    if (syncEnabled.value) return;
    syncEnabled.value = true;

    const video = videoElement.value;
    if (video) {
      bindVideoEvents(video);
    }

    // 註冊頁面可見性事件
    document.addEventListener('visibilitychange', handleVisibilityChange);
  };

  // 停用同步
  const disableSync = () => {
    syncEnabled.value = false;

    const video = videoElement.value;
    if (video) {
      unbindVideoEvents(video);
    }

    // 移除頁面可見性事件
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };

  // 監聽影片元素變化
  watch(videoElement, (video, oldVideo) => {
    if (oldVideo) {
      unbindVideoEvents(oldVideo);
    }

    if (video && syncEnabled.value) {
      bindVideoEvents(video);
    }
  });

  // 清理
  onUnmounted(() => {
    const video = videoElement.value;
    if (video) {
      unbindVideoEvents(video);
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });

  return {
    syncEnabled,
    enableSync,
    disableSync,
  };
}
