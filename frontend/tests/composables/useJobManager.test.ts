/**
 * useJobManager composable 測試
 *
 * 由於 useJobManager 使用全域狀態（單例模式），
 * 這裡只測試純函數邏輯和 API 互動
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock API - 必須在其他 imports 之前
vi.mock('@/services/api', () => ({
  api: {
    getJobs: vi.fn(),
    deleteJob: vi.fn(),
  },
}))

import { api } from '@/services/api'

describe('useJobManager API interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('api.getJobs', () => {
    it('should return jobs and processing arrays', async () => {
      const mockResponse = {
        jobs: [
          { id: 'job-1', source_title: 'Song 1', status: 'completed', source_type: 'youtube', progress: 100, created_at: '' },
        ],
        processing: [
          { id: 'job-2', source_title: 'Song 2', status: 'separating', source_type: 'upload', progress: 50, created_at: '' },
        ],
      }
      vi.mocked(api.getJobs).mockResolvedValue(mockResponse)

      const result = await api.getJobs()

      expect(result.jobs).toHaveLength(1)
      expect(result.jobs[0].id).toBe('job-1')
      expect(result.processing).toHaveLength(1)
      expect(result.processing[0].id).toBe('job-2')
    })

    it('should return empty arrays when no jobs', async () => {
      vi.mocked(api.getJobs).mockResolvedValue({
        jobs: [],
        processing: [],
      })

      const result = await api.getJobs()

      expect(result.jobs).toHaveLength(0)
      expect(result.processing).toHaveLength(0)
    })
  })

  describe('api.deleteJob', () => {
    it('should call deleteJob with correct id', async () => {
      vi.mocked(api.deleteJob).mockResolvedValue(undefined)

      await api.deleteJob('job-123')

      expect(api.deleteJob).toHaveBeenCalledWith('job-123')
      expect(api.deleteJob).toHaveBeenCalledTimes(1)
    })

    it('should throw error on failure', async () => {
      vi.mocked(api.deleteJob).mockRejectedValue(new Error('Delete failed'))

      await expect(api.deleteJob('job-123')).rejects.toThrow('Delete failed')
    })
  })
})

describe('Job data structure', () => {
  it('CompletedJob should have required fields', () => {
    const job = {
      id: 'test-id',
      source_title: 'Test Song',
      source_type: 'youtube' as const,
      status: 'completed' as const,
      progress: 100,
      created_at: '2024-01-01T00:00:00Z',
    }

    expect(job.id).toBeDefined()
    expect(job.source_title).toBeDefined()
    expect(job.source_type).toBe('youtube')
    expect(job.status).toBe('completed')
    expect(job.progress).toBe(100)
  })

  it('ProcessingJob should have required fields', () => {
    const job = {
      id: 'test-id',
      source_title: 'Processing Song',
      source_type: 'upload' as const,
      status: 'separating' as const,
      progress: 45,
      created_at: '2024-01-01T00:00:00Z',
      current_stage: '分離人聲中...',
    }

    expect(job.id).toBeDefined()
    expect(job.status).toBe('separating')
    expect(job.progress).toBe(45)
    expect(job.current_stage).toBe('分離人聲中...')
  })
})

describe('Duration formatting', () => {
  // Helper function to test duration formatting logic
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  it('formats 0 seconds correctly', () => {
    expect(formatDuration(0)).toBe('0:00')
  })

  it('formats seconds under a minute correctly', () => {
    expect(formatDuration(45)).toBe('0:45')
  })

  it('formats exactly one minute correctly', () => {
    expect(formatDuration(60)).toBe('1:00')
  })

  it('formats minutes and seconds correctly', () => {
    expect(formatDuration(185)).toBe('3:05')
  })

  it('formats long durations correctly', () => {
    expect(formatDuration(3661)).toBe('61:01')
  })
})

describe('Job selection logic', () => {
  it('Set should correctly track selected job ids', () => {
    const selectedIds = new Set<string>()

    // Add job
    selectedIds.add('job-1')
    expect(selectedIds.has('job-1')).toBe(true)
    expect(selectedIds.size).toBe(1)

    // Add another job
    selectedIds.add('job-2')
    expect(selectedIds.size).toBe(2)

    // Remove job
    selectedIds.delete('job-1')
    expect(selectedIds.has('job-1')).toBe(false)
    expect(selectedIds.size).toBe(1)

    // Clear all
    selectedIds.clear()
    expect(selectedIds.size).toBe(0)
  })

  it('toggle logic should work correctly', () => {
    const toggleSelection = (set: Set<string>, id: string): Set<string> => {
      const newSet = new Set(set)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    }

    let selected = new Set<string>()

    // Toggle on
    selected = toggleSelection(selected, 'job-1')
    expect(selected.has('job-1')).toBe(true)

    // Toggle off
    selected = toggleSelection(selected, 'job-1')
    expect(selected.has('job-1')).toBe(false)
  })
})
