export interface TrackPaths {
  drums: string | null;
  bass: string | null;
  other: string | null;
  vocals: string | null;
}

export interface MixSettings {
  drums_volume: number;    // 0.0 - 2.0
  bass_volume: number;
  other_volume: number;
  vocals_volume: number;
  pitch_shift: number;     // -12 to +12
  output_format: OutputFormat;
}

export type OutputFormat = 'mp4' | 'mp3' | 'm4a' | 'wav';

export type TrackName = 'drums' | 'bass' | 'other' | 'vocals';

export interface TracksInfo {
  tracks: TrackName[];
  sample_rate: number;
  duration: number;
}

export interface MixResponse {
  mix_id: string;
  status: 'processing' | 'completed' | 'failed';
  download_url: string | null;
  cached: boolean;
  progress?: number;
}

export interface TrackState {
  name: TrackName;
  volume: number;
  loaded: boolean;
  error: string | null;
}

export const DEFAULT_VOLUMES: Record<TrackName, number> = {
  drums: 1.0,
  bass: 1.0,
  other: 1.0,
  vocals: 0.0,  // 預設關閉人聲
};

export const TRACK_LABELS: Record<TrackName, string> = {
  drums: '鼓聲',
  bass: '貝斯',
  other: '其他樂器',
  vocals: '人聲',
};
