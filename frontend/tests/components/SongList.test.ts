/**
 * SongList Component Tests
 * Feature: 005-frontend-processing / User Story 2
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SongList from '@/components/SongList.vue'

// Mock sub-components
vi.mock('@/components/SongItem.vue', () => ({
  default: {
    name: 'SongItem',
    props: ['job', 'isSelected', 'isChecked'],
    template: '<div class="song-item" :data-id="job.id">{{ job.source_title }}</div>',
  },
}))

vi.mock('@/components/EmptyState.vue', () => ({
  default: {
    name: 'EmptyState',
    props: ['title', 'description'],
    template: '<div class="empty-state">{{ title }}</div>',
  },
}))

describe('SongList', () => {
  const mockJobs = [
    {
      id: 'song-1',
      source_title: '測試歌曲 1',
      source_type: 'upload',
      status: 'completed',
      original_duration: 180,
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 'song-2',
      source_title: '測試歌曲 2',
      source_type: 'youtube',
      status: 'completed',
      original_duration: 240,
      created_at: '2024-01-02T00:00:00Z',
    },
  ]

  describe('顯示', () => {
    it('應該在沒有歌曲時顯示空狀態', () => {
      const wrapper = mount(SongList, {
        props: {
          jobs: [],
        },
      })

      expect(wrapper.find('.empty-state').exists()).toBe(true)
    })

    it('應該顯示歌曲列表', () => {
      const wrapper = mount(SongList, {
        props: {
          jobs: mockJobs,
        },
      })

      const items = wrapper.findAll('.song-item')
      expect(items).toHaveLength(2)
    })

    it('應該標記選中的歌曲', () => {
      const wrapper = mount(SongList, {
        props: {
          jobs: mockJobs,
          selectedJobId: 'song-1',
        },
      })

      // SongItem 會收到 isSelected prop
      const songItems = wrapper.findAllComponents({ name: 'SongItem' })
      expect(songItems[0].props('isSelected')).toBe(true)
      expect(songItems[1].props('isSelected')).toBe(false)
    })
  })

  describe('批次選擇', () => {
    it('應該顯示已選數量', () => {
      const wrapper = mount(SongList, {
        props: {
          jobs: mockJobs,
          selectedJobIds: new Set(['song-1']),
          showBatchActions: true,
        },
      })

      expect(wrapper.text()).toContain('1 首已選')
    })

    it('全選時應該發出 selectAll 事件', async () => {
      const wrapper = mount(SongList, {
        props: {
          jobs: mockJobs,
          selectedJobIds: new Set(),
          showBatchActions: true,
        },
      })

      const checkbox = wrapper.find('.select-all input')
      await checkbox.trigger('change')

      expect(wrapper.emitted('selectAll')).toBeTruthy()
    })

    it('全部已選時點擊應該發出 deselectAll 事件', async () => {
      const wrapper = mount(SongList, {
        props: {
          jobs: mockJobs,
          selectedJobIds: new Set(['song-1', 'song-2']),
          showBatchActions: true,
        },
      })

      const checkbox = wrapper.find('.select-all input')
      await checkbox.trigger('change')

      expect(wrapper.emitted('deselectAll')).toBeTruthy()
    })
  })

  describe('事件', () => {
    it('應該轉發 select 事件', async () => {
      const wrapper = mount(SongList, {
        props: {
          jobs: mockJobs,
        },
      })

      const songItem = wrapper.findComponent({ name: 'SongItem' })
      await songItem.vm.$emit('select', 'song-1')

      expect(wrapper.emitted('select')).toBeTruthy()
      expect(wrapper.emitted('select')![0]).toEqual(['song-1'])
    })

    it('應該轉發 delete 事件', async () => {
      const wrapper = mount(SongList, {
        props: {
          jobs: mockJobs,
        },
      })

      const songItem = wrapper.findComponent({ name: 'SongItem' })
      await songItem.vm.$emit('delete', 'song-1')

      expect(wrapper.emitted('delete')).toBeTruthy()
      expect(wrapper.emitted('delete')![0]).toEqual(['song-1'])
    })

    it('應該轉發 toggle 事件', async () => {
      const wrapper = mount(SongList, {
        props: {
          jobs: mockJobs,
        },
      })

      const songItem = wrapper.findComponent({ name: 'SongItem' })
      await songItem.vm.$emit('toggle', 'song-1')

      expect(wrapper.emitted('toggle')).toBeTruthy()
      expect(wrapper.emitted('toggle')![0]).toEqual(['song-1'])
    })
  })
})
