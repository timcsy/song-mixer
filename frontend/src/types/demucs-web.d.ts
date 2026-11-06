/**
 * Type declarations for demucs-web
 */
declare module 'demucs-web' {
  interface SeparationProgressInfo {
    progress: number
    currentSegment: number
    totalSegments: number
  }

  interface DemucsOptions {
    ort: typeof import('onnxruntime-web')
    sessionOptions?: Record<string, unknown>
    onProgress?: (info: SeparationProgressInfo) => void
    onDownloadProgress?: (loaded: number, total: number) => void
    onLog?: (phase: string, msg: string) => void
  }

  interface StereoChannels {
    left: Float32Array
    right: Float32Array
  }

  interface SeparationResult {
    drums: StereoChannels
    bass: StereoChannels
    other: StereoChannels
    vocals: StereoChannels
  }

  export class DemucsProcessor {
    constructor(options: DemucsOptions)
    loadModel(url: string | ArrayBuffer): Promise<unknown>
    separate(left: Float32Array, right: Float32Array): Promise<SeparationResult>
  }

  export const CONSTANTS: {
    DEFAULT_MODEL_URL: string
    SAMPLE_RATE: number
  }
}
