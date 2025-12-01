import JSZip from 'jszip'
import type { BackendCapabilities, YouTubeInfo } from '@/types/storage'

const API_BASE = '/api/v1';

// ========== Backend Capabilities ==========

/**
 * 後端功能偵測結果快取
 */
let backendCapabilitiesCache: BackendCapabilities | null = null

/**
 * 檢查後端是否可用
 */
export async function checkBackendHealth(): Promise<BackendCapabilities> {
  if (backendCapabilitiesCache) {
    return backendCapabilitiesCache
  }

  try {
    const response = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.ok) {
      throw new Error('Backend not available')
    }

    const data = await response.json()
    backendCapabilitiesCache = {
      available: true,
      youtube: data.features?.youtube ?? false,
      ffmpeg: data.features?.ffmpeg ?? false,
    }
  } catch {
    backendCapabilitiesCache = {
      available: false,
      youtube: false,
      ffmpeg: false,
    }
  }

  return backendCapabilitiesCache
}

/**
 * 重設後端功能快取（用於測試或重新偵測）
 */
export function resetBackendCapabilitiesCache(): void {
  backendCapabilitiesCache = null
}

/**
 * 取得後端功能偵測結果（同步，需先呼叫 checkBackendHealth）
 */
export function getBackendCapabilities(): BackendCapabilities {
  return backendCapabilitiesCache ?? { available: false, youtube: false, ffmpeg: false }
}

// ========== YouTube API (Docker mode only) ==========

/**
 * 取得 YouTube 影片資訊
 */
export async function getYouTubeInfo(url: string): Promise<YouTubeInfo> {
  const response = await fetch(`${API_BASE}/youtube/info?url=${encodeURIComponent(url)}`)

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || '無法取得影片資訊')
  }

  return response.json()
}

/**
 * 下載進度資訊
 */
interface DownloadProgress {
  status: string
  progress: number
  message: string
  stage: string
  title: string
  duration: number
  thumbnail: string
  error?: string
}

/**
 * 下載 YouTube 影片（分離的影片和音訊）
 * 使用 polling 機制追蹤後端下載進度
 * @param url YouTube 網址
 * @param onProgress 下載進度回呼 (progress: 0-100, message: string)
 * @returns ZIP 內容（video + audio）+ 影片元資料
 */
export async function downloadYouTube(
  url: string,
  onProgress?: (progress: number, message: string) => void
): Promise<{
  video: ArrayBuffer
  videoExt: string
  audio: ArrayBuffer
  audioExt: string
  title: string
  duration: number
  thumbnail: string
}> {
  const JSZip = (await import('jszip')).default

  // 1. 啟動下載任務
  const startResponse = await fetch(`${API_BASE}/youtube/download/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })

  if (!startResponse.ok) {
    const error = await startResponse.json()
    throw new Error(error.detail?.message || error.message || '下載失敗')
  }

  const { task_id } = await startResponse.json()

  // 2. Polling 進度（每秒一次）
  let progressData: DownloadProgress
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 1000))

    const progressResponse = await fetch(`${API_BASE}/youtube/download/progress/${task_id}`)
    if (!progressResponse.ok) {
      throw new Error('無法取得下載進度')
    }

    progressData = await progressResponse.json()
    onProgress?.(progressData.progress, progressData.message)

    if (progressData.status === 'completed') {
      break
    }
    if (progressData.status === 'error') {
      throw new Error(progressData.error || '下載失敗')
    }
  }

  // 3. 取得結果
  const resultResponse = await fetch(`${API_BASE}/youtube/download/result/${task_id}`)
  if (!resultResponse.ok) {
    const error = await resultResponse.json()
    throw new Error(error.detail?.message || '取得結果失敗')
  }

  const zipBuffer = await resultResponse.arrayBuffer()
  const title = decodeURIComponent(resultResponse.headers.get('X-Video-Title') || progressData!.title || 'Unknown')
  const duration = parseFloat(resultResponse.headers.get('X-Video-Duration') || String(progressData!.duration) || '0')
  const thumbnail = resultResponse.headers.get('X-Video-Thumbnail') || progressData!.thumbnail || ''

  // 解壓縮 ZIP
  const zip = await JSZip.loadAsync(zipBuffer)

  // 找出影片和音訊檔案
  const result: {
    videoFile: JSZip.JSZipObject | null
    audioFile: JSZip.JSZipObject | null
    videoExt: string
    audioExt: string
  } = { videoFile: null, audioFile: null, videoExt: '', audioExt: '' }

  zip.forEach((relativePath, file) => {
    if (relativePath.startsWith('video.')) {
      result.videoFile = file
      result.videoExt = relativePath.split('.').pop() || 'mp4'
    } else if (relativePath.startsWith('audio.')) {
      result.audioFile = file
      result.audioExt = relativePath.split('.').pop() || 'm4a'
    }
  })

  if (!result.videoFile || !result.audioFile) {
    throw new Error('ZIP 檔案格式錯誤')
  }

  const video = await result.videoFile.async('arraybuffer')
  const audio = await result.audioFile.async('arraybuffer')
  const { videoExt, audioExt } = result

  return { video, videoExt, audio, audioExt, title, duration, thumbnail }
}

// ========== Legacy Types ==========

export interface Job {
  id: string;
  source_type: 'youtube' | 'upload';
  source_title: string | null;
  status: 'pending' | 'downloading' | 'separating' | 'merging' | 'completed' | 'failed';
  progress: number;
  current_stage: string | null;
  error_message: string | null;
  created_at: string | Date;
  updated_at?: string | Date;
  expires_at?: string;
}

export type OutputFormat = 'mp4' | 'mp3' | 'm4a' | 'wav';

export interface Result {
  original_duration: number;
  output_size: number | null;
  download_url: string | null;
}

export interface JobWithResult extends Job {
  result: Result | null;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  redis: boolean;
  storage: boolean;
  version: string;
}

export interface MixRequest {
  drums_volume: number;
  bass_volume: number;
  other_volume: number;
  vocals_volume: number;
  pitch_shift: number;
  output_format: OutputFormat;
}

export interface MixStatusResponse {
  mix_id: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  download_url: string | null;
  cached: boolean;
  error_message: string | null;
}

// ========== Video Mixer Types ==========

export interface CompletedJob {
  id: string;
  source_title: string | null;
  source_type: 'youtube' | 'upload';
  status: 'completed';
  original_duration: number | null;
  created_at: string;
  storage_size?: number;
}

export interface ProcessingJob {
  id: string;
  source_title: string | null;
  source_type?: 'youtube' | 'upload';
  status: 'pending' | 'downloading' | 'separating' | 'merging' | 'mixing';
  progress: number;
  current_stage: string | null;
}

export interface JobsListResponse {
  jobs: CompletedJob[];
  processing: ProcessingJob[];
}

export interface ExportRequest {
  job_ids: string[];
}

export interface ExportResponse {
  download_url: string;
}

export interface ImportConflict {
  conflict_id: string;
  source_title: string;
  existing_job_id: string;
}

export interface ImportedJob {
  id: string;
  source_title: string | null;
}

export interface ImportResponse {
  imported: ImportedJob[];
  conflicts: ImportConflict[];
  errors: string[];
}

export interface ResolveConflictResponse {
  job: ImportedJob | null;
  error: string | null;
}

class ApiService {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw error;
    }

    return response.json();
  }

  async createJobFromUrl(url: string): Promise<Job> {
    return this.request<Job>('/jobs', {
      method: 'POST',
      body: JSON.stringify({
        source_type: 'youtube',
        source_url: url,
      }),
    });
  }

  async createJobFromUpload(file: File): Promise<Job> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/jobs/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw error;
    }

    return response.json();
  }

  async getJob(jobId: string): Promise<JobWithResult> {
    return this.request<JobWithResult>(`/jobs/${jobId}`);
  }

  getDownloadUrl(jobId: string): string {
    return `${API_BASE}/jobs/${jobId}/download`;
  }

  getStreamUrl(jobId: string): string {
    return `${API_BASE}/jobs/${jobId}/stream`;
  }

  async healthCheck(): Promise<HealthStatus> {
    return this.request<HealthStatus>('/health');
  }

  async createMix(jobId: string, settings: MixRequest): Promise<MixStatusResponse> {
    return this.request<MixStatusResponse>(`/jobs/${jobId}/mix`, {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  }

  async getMixStatus(jobId: string, mixId: string): Promise<MixStatusResponse> {
    return this.request<MixStatusResponse>(`/jobs/${jobId}/mix/${mixId}`);
  }

  getMixDownloadUrl(jobId: string, mixId: string): string {
    return `${API_BASE}/jobs/${jobId}/mix/${mixId}/download`;
  }

  // ========== Video Mixer API ==========

  async getJobs(): Promise<JobsListResponse> {
    return this.request<JobsListResponse>('/jobs');
  }

  async deleteJob(jobId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw error;
    }
  }

  async exportJobs(jobIds: string[]): Promise<ExportResponse> {
    return this.request<ExportResponse>('/jobs/export', {
      method: 'POST',
      body: JSON.stringify({ job_ids: jobIds }),
    });
  }

  getExportDownloadUrl(exportId: string): string {
    return `${API_BASE}/jobs/export/download/${exportId}`;
  }

  async importJobs(file: File): Promise<ImportResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/jobs/import`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw error;
    }

    return response.json();
  }

  async resolveImportConflict(
    conflictId: string,
    action: 'overwrite' | 'rename',
    newTitle?: string
  ): Promise<ResolveConflictResponse> {
    return this.request<ResolveConflictResponse>(`/jobs/import/resolve/${conflictId}`, {
      method: 'POST',
      body: JSON.stringify({ action, new_title: newTitle }),
    });
  }
}

export const api = new ApiService();
