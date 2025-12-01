/**
 * 格式化工具函數
 */

/**
 * 格式化時間長度（秒數 → mm:ss）
 */
export function formatDuration(seconds: number): string {
  const totalSecs = Math.floor(seconds)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * 格式化檔案大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * 音訊格式轉換工具
 * 用於壓縮音軌儲存（Float32 → Int16 可減少 50% 空間）
 */

/**
 * Float32 轉換為 Int16
 * Float32 範圍: -1.0 ~ 1.0
 * Int16 範圍: -32768 ~ 32767
 */
export function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    // 限制範圍並轉換
    const sample = Math.max(-1, Math.min(1, float32[i]))
    int16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  return int16
}

/**
 * Int16 轉換為 Float32
 */
export function int16ToFloat32(int16: Int16Array): Float32Array {
  const float32 = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] < 0 ? int16[i] / 0x8000 : int16[i] / 0x7fff
  }
  return float32
}

/**
 * 將立體聲 Float32 轉換為 Int16 ArrayBuffer（用於儲存）
 */
export function stereoFloat32ToInt16Buffer(left: Float32Array, right: Float32Array): ArrayBuffer {
  const int16Left = float32ToInt16(left)
  const int16Right = float32ToInt16(right)
  const interleavedLength = int16Left.length + int16Right.length
  const interleaved = new Int16Array(interleavedLength)

  // 交錯排列左右聲道
  for (let i = 0; i < int16Left.length; i++) {
    interleaved[i * 2] = int16Left[i]
    interleaved[i * 2 + 1] = int16Right[i]
  }

  return interleaved.buffer
}

/**
 * 從 Int16 ArrayBuffer 還原為立體聲 Float32
 */
export function int16BufferToStereoFloat32(buffer: ArrayBuffer): { left: Float32Array; right: Float32Array } {
  const interleaved = new Int16Array(buffer)
  const length = interleaved.length / 2
  const int16Left = new Int16Array(length)
  const int16Right = new Int16Array(length)

  for (let i = 0; i < length; i++) {
    int16Left[i] = interleaved[i * 2]
    int16Right[i] = interleaved[i * 2 + 1]
  }

  return {
    left: int16ToFloat32(int16Left),
    right: int16ToFloat32(int16Right),
  }
}
