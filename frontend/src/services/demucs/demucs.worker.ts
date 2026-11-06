/**
 * Demucs Web Worker
 *
 * 在背景執行緒執行 WAV 解析、音源分離與 Int16 轉換，
 * 避免長時間運算占住主執行緒，讓播放與 UI 保持流暢。
 */

import { createDemucsCore } from './demucsCore'
import type { DemucsRequest, DemucsResponse } from './protocol'

// 專案 tsconfig 只含 DOM lib，這裡自行宣告 Worker 端需要的介面
interface WorkerScope {
  postMessage(message: DemucsResponse, transfer?: Transferable[]): void
  onmessage: ((event: MessageEvent<DemucsRequest>) => void) | null
}
const scope = self as unknown as WorkerScope

// 目前正在初始化的請求 id（用於回報下載進度）
let initRequestId = 0

const core = createDemucsCore({
  onDownloadProgress: (loaded, total) => {
    scope.postMessage({ type: 'downloadProgress', id: initRequestId, loaded, total })
  },
  onLog: (phase, msg) => {
    scope.postMessage({ type: 'log', phase, msg })
  },
})

scope.onmessage = async (event) => {
  const request = event.data

  try {
    switch (request.type) {
      case 'init': {
        initRequestId = request.id
        await core.init(request.options)
        scope.postMessage({ type: 'done', id: request.id })
        break
      }

      case 'separate': {
        const result = await core.separateWav(request.wav, (info) => {
          scope.postMessage({ type: 'progress', id: request.id, info })
        })
        // 以 transfer 回傳，不複製大型音軌資料
        const { drums, bass, other, vocals } = result.tracks
        scope.postMessage(
          { type: 'done', id: request.id, result },
          [drums, bass, other, vocals]
        )
        break
      }
    }
  } catch (error) {
    scope.postMessage({
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
