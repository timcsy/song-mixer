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
 * 下載 YouTube 影片並提取音頻
 * @returns WAV ArrayBuffer + 影片元資料
 */
export async function downloadYouTube(url: string): Promise<{
  audio: ArrayBuffer
  title: string
  duration: number
  thumbnail: string
}> {
  const response = await fetch(`${API_BASE}/youtube/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || '下載失敗')
  }

  const audioBuffer = await response.arrayBuffer()
  const title = decodeURIComponent(response.headers.get('X-Video-Title') || 'Unknown')
  const duration = parseFloat(response.headers.get('X-Video-Duration') || '0')
  const thumbnail = response.headers.get('X-Video-Thumbnail') || ''

  return { audio: audioBuffer, title, duration, thumbnail }
}

// ========== Legacy Types ==========

export interface Job {
  id: string;
  source_type: 'youtube' | 'upload';
  source_title: string | null;
  status: 'pending' | 'downloading' | 'separating' | 'merging' | 'completed' | 'failed';
  progress: number;
  current_stage: string;
  error_message: string | null;
  created_at: string;
  expires_at: string;
}

export type OutputFormat = 'mp4' | 'mp3' | 'm4a' | 'wav';

export interface Result {
  original_duration: number;
  output_size: number;
  download_url: string;
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
}

export interface ProcessingJob {
  id: string;
  source_title: string | null;
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
