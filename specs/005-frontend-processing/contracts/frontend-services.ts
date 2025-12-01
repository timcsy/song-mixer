/**
 * Frontend Service Contracts
 * 純前端人聲去除服務架構改造
 *
 * 此檔案定義前端服務層的介面契約
 */

// ============================================
// Types
// ============================================

export interface SongRecord {
  id: string;
  title: string;
  sourceType: 'youtube' | 'upload';
  sourceUrl?: string;
  thumbnailUrl?: string;
  duration: number;
  sampleRate: 44100;
  tracks: {
    drums: ArrayBuffer;
    bass: ArrayBuffer;
    other: ArrayBuffer;
    vocals: ArrayBuffer;
  };
  originalVideo?: ArrayBuffer;
  createdAt: Date;
}

export interface ProcessingState {
  stage: 'idle' | 'downloading' | 'extracting' | 'separating' | 'saving';
  progress: number;
  error: string | null;
  songId?: string;
}

export interface TrackSettings {
  volume: number;
  muted: boolean;
  solo: boolean;
}

export interface MixerSettings {
  drums: TrackSettings;
  bass: TrackSettings;
  other: TrackSettings;
  vocals: TrackSettings;
  pitchShift: number;
  masterVolume: number;
}

export interface BackendCapabilities {
  available: boolean;
  youtube: boolean;
  ffmpeg: boolean;
}

export interface BrowserCapabilities {
  sharedArrayBuffer: boolean;
  webGPU: boolean;
  indexedDB: boolean;
  serviceWorker: boolean;
}

export type OutputFormat = 'mp4' | 'mp3' | 'm4a' | 'wav';

// ============================================
// StorageService Contract
// ============================================

export interface IStorageService {
  /**
   * 初始化 IndexedDB 連線
   */
  init(): Promise<void>;

  /**
   * 儲存歌曲記錄
   */
  saveSong(song: SongRecord): Promise<void>;

  /**
   * 取得單首歌曲
   */
  getSong(id: string): Promise<SongRecord | null>;

  /**
   * 取得所有歌曲（依建立時間排序）
   */
  getAllSongs(): Promise<SongRecord[]>;

  /**
   * 刪除歌曲
   */
  deleteSong(id: string): Promise<void>;

  /**
   * 取得儲存使用量
   */
  getStorageUsage(): Promise<{ used: number; quota: number }>;
}

// ============================================
// DemucsService Contract
// ============================================

export interface SeparationResult {
  drums: { left: Float32Array; right: Float32Array };
  bass: { left: Float32Array; right: Float32Array };
  other: { left: Float32Array; right: Float32Array };
  vocals: { left: Float32Array; right: Float32Array };
}

export interface IDemucsService {
  /**
   * 初始化並載入模型（延遲載入）
   * @param onProgress 模型下載進度回呼 (0-1)
   */
  initialize(onProgress?: (progress: number) => void): Promise<void>;

  /**
   * 檢查模型是否已載入
   */
  isLoaded(): boolean;

  /**
   * 執行音源分離
   * @param left 左聲道 Float32Array (44.1kHz)
   * @param right 右聲道 Float32Array (44.1kHz)
   * @param onProgress 分離進度回呼 (0-1)
   */
  separate(
    left: Float32Array,
    right: Float32Array,
    onProgress?: (progress: number) => void
  ): Promise<SeparationResult>;
}

// ============================================
// FFmpegService Contract
// ============================================

export interface IFFmpegService {
  /**
   * 初始化 ffmpeg.wasm
   * @param onProgress 載入進度回呼
   */
  initialize(onProgress?: (progress: number) => void): Promise<void>;

  /**
   * 檢查是否已初始化
   */
  isLoaded(): boolean;

  /**
   * 從影片提取音頻
   * @returns WAV ArrayBuffer (44.1kHz, 立體聲, 16-bit PCM)
   */
  extractAudio(
    videoBlob: Blob,
    onProgress?: (progress: number) => void
  ): Promise<ArrayBuffer>;

  /**
   * 合併影片與音訊
   */
  mergeVideoAudio(
    videoBlob: Blob,
    audioBuffer: ArrayBuffer,
    format: 'mp4' | 'm4a',
    onProgress?: (progress: number) => void
  ): Promise<Blob>;
}

// ============================================
// AudioExportService Contract
// ============================================

export interface IAudioExportService {
  /**
   * 混音並輸出為 WAV
   */
  mixToWav(
    tracks: Array<{ buffer: AudioBuffer; volume: number }>,
    duration: number,
    sampleRate?: number
  ): Promise<ArrayBuffer>;

  /**
   * 混音並輸出為 MP3
   */
  mixToMp3(
    tracks: Array<{ buffer: AudioBuffer; volume: number }>,
    duration: number,
    bitrate?: number
  ): Promise<Blob>;

  /**
   * 將 ArrayBuffer (Float32 立體聲) 轉換為 AudioBuffer
   */
  arrayBufferToAudioBuffer(
    buffer: ArrayBuffer,
    sampleRate: number
  ): Promise<AudioBuffer>;
}

// ============================================
// LocalProcessorService Contract
// ============================================

export interface ProcessOptions {
  onProgress?: (state: ProcessingState) => void;
}

export interface ILocalProcessorService {
  /**
   * 處理本地上傳的影片檔案
   * @returns 新建立的 SongRecord.id
   */
  processUpload(
    file: File,
    title: string,
    options?: ProcessOptions
  ): Promise<string>;

  /**
   * 處理 YouTube 影片（僅 Docker 模式）
   * @returns 新建立的 SongRecord.id
   */
  processYouTube(
    url: string,
    options?: ProcessOptions
  ): Promise<string>;

  /**
   * 取消當前處理
   */
  cancel(): void;
}

// ============================================
// ApiService Contract (簡化版)
// ============================================

export interface YouTubeInfo {
  title: string;
  duration: number;
  thumbnail: string;
  uploader: string;
}

export interface IApiService {
  /**
   * 檢查後端是否可用
   */
  checkHealth(): Promise<BackendCapabilities>;

  /**
   * 取得 YouTube 影片資訊
   */
  getYouTubeInfo(url: string): Promise<YouTubeInfo>;

  /**
   * 下載 YouTube 影片並提取音頻
   * @returns WAV ArrayBuffer + 影片元資料
   */
  downloadYouTube(url: string): Promise<{
    audio: ArrayBuffer;
    title: string;
    duration: number;
    thumbnail: string;
  }>;

  /**
   * 使用後端 FFmpeg 提取音頻
   */
  extractAudioBackend(video: File): Promise<{
    audio: ArrayBuffer;
    duration: number;
  }>;

  /**
   * 使用後端 FFmpeg 合併影片與音訊
   */
  mergeBackend(
    video: Blob,
    audio: ArrayBuffer,
    format: 'mp4' | 'm4a'
  ): Promise<Blob>;
}

// ============================================
// BrowserCheckService Contract
// ============================================

export interface IBrowserCheckService {
  /**
   * 檢查瀏覽器功能支援
   */
  check(): BrowserCapabilities;

  /**
   * 檢查是否支援核心功能
   * @returns true 如果 SharedArrayBuffer 可用
   */
  isSupported(): boolean;

  /**
   * 取得不支援的功能警告訊息
   */
  getWarnings(): string[];
}
