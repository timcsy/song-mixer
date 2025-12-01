/**
 * Type declarations for demucs-web
 */
declare module 'demucs-web' {
  interface DemucsOptions {
    ort: typeof import('onnxruntime-web')
    onProgress?: (progress: number) => void
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
    loadModel(url: string): Promise<void>
    separate(
      left: Float32Array,
      right: Float32Array,
      onProgress?: (progress: number) => void
    ): Promise<SeparationResult>
  }

  export const CONSTANTS: {
    DEFAULT_MODEL_URL: string
    SAMPLE_RATE: number
  }
}
