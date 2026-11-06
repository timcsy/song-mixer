/**
 * WAV 解析工具
 * 不依賴 DOM，可在主執行緒或 Web Worker 中使用
 */

/**
 * 解析 WAV 檔案為立體聲 Float32Array
 */
export function parseWavToStereo(wavBuffer: ArrayBuffer): {
  left: Float32Array
  right: Float32Array
  sampleRate: number
  duration: number
} {
  const view = new DataView(wavBuffer)

  // 驗證 WAV 標頭
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
  if (riff !== 'RIFF') {
    throw new Error('無效的 WAV 檔案')
  }

  // 讀取格式資訊
  const numChannels = view.getUint16(22, true)
  const sampleRate = view.getUint32(24, true)
  const bitsPerSample = view.getUint16(34, true)

  // 尋找 data chunk
  let dataOffset = 44
  let dataSize = 0

  // 簡單解析：假設 data chunk 在標準位置
  const dataMarker = String.fromCharCode(view.getUint8(36), view.getUint8(37), view.getUint8(38), view.getUint8(39))
  if (dataMarker === 'data') {
    dataSize = view.getUint32(40, true)
  } else {
    // 搜尋 data chunk
    for (let i = 36; i < Math.min(wavBuffer.byteLength - 8, 200); i++) {
      if (
        view.getUint8(i) === 0x64 && // 'd'
        view.getUint8(i + 1) === 0x61 && // 'a'
        view.getUint8(i + 2) === 0x74 && // 't'
        view.getUint8(i + 3) === 0x61 // 'a'
      ) {
        dataSize = view.getUint32(i + 4, true)
        dataOffset = i + 8
        break
      }
    }
  }

  if (dataSize === 0) {
    throw new Error('無法解析 WAV 檔案')
  }

  const bytesPerSample = bitsPerSample / 8
  const samplesPerChannel = dataSize / bytesPerSample / numChannels
  const duration = samplesPerChannel / sampleRate

  // 轉換為 Float32Array
  const left = new Float32Array(samplesPerChannel)
  const right = new Float32Array(samplesPerChannel)

  if (bitsPerSample === 16) {
    for (let i = 0; i < samplesPerChannel; i++) {
      const sampleOffset = dataOffset + i * numChannels * bytesPerSample
      left[i] = view.getInt16(sampleOffset, true) / 32768
      if (numChannels === 2) {
        right[i] = view.getInt16(sampleOffset + 2, true) / 32768
      } else {
        right[i] = left[i] // 單聲道轉立體聲
      }
    }
  } else if (bitsPerSample === 32) {
    // Float32
    for (let i = 0; i < samplesPerChannel; i++) {
      const sampleOffset = dataOffset + i * numChannels * bytesPerSample
      left[i] = view.getFloat32(sampleOffset, true)
      if (numChannels === 2) {
        right[i] = view.getFloat32(sampleOffset + 4, true)
      } else {
        right[i] = left[i]
      }
    }
  }

  return { left, right, sampleRate, duration }
}

/**
 * 只讀取 WAV 標頭取得取樣率與時長（不解碼音訊資料，成本極低）
 */
export function readWavInfo(wavBuffer: ArrayBuffer): { sampleRate: number; duration: number } {
  const view = new DataView(wavBuffer)
  const numChannels = view.getUint16(22, true)
  const sampleRate = view.getUint32(24, true)
  const bitsPerSample = view.getUint16(34, true)

  let dataSize = 0
  for (let i = 36; i < Math.min(wavBuffer.byteLength - 8, 200); i++) {
    if (
      view.getUint8(i) === 0x64 && // 'd'
      view.getUint8(i + 1) === 0x61 && // 'a'
      view.getUint8(i + 2) === 0x74 && // 't'
      view.getUint8(i + 3) === 0x61 // 'a'
    ) {
      dataSize = view.getUint32(i + 4, true)
      break
    }
  }

  const bytesPerFrame = (bitsPerSample / 8) * numChannels
  const duration = bytesPerFrame > 0 && sampleRate > 0 ? dataSize / bytesPerFrame / sampleRate : 0
  return { sampleRate, duration }
}
