/**
 * EmptyState 元件測試
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EmptyState from '@/components/EmptyState.vue'

describe('EmptyState', () => {
  it('renders title correctly', () => {
    const wrapper = mount(EmptyState, {
      props: {
        title: 'No Data',
      },
    })

    expect(wrapper.find('.empty-title').text()).toBe('No Data')
  })

  it('renders default title when not provided', () => {
    const wrapper = mount(EmptyState)

    expect(wrapper.find('.empty-title').text()).toBe('尚無歌曲')
  })

  it('renders description when provided', () => {
    const wrapper = mount(EmptyState, {
      props: {
        title: 'No Data',
        description: 'There is no data to display',
      },
    })

    expect(wrapper.find('.empty-description').text()).toBe('There is no data to display')
  })

  it('renders default description when not provided', () => {
    const wrapper = mount(EmptyState)

    expect(wrapper.find('.empty-description').text()).toBe('點擊「新增歌曲」開始處理您的第一首歌曲')
  })

  it('renders action slot content', () => {
    const wrapper = mount(EmptyState, {
      props: {
        title: 'No Data',
      },
      slots: {
        action: '<button class="test-btn">Add Item</button>',
      },
    })

    expect(wrapper.find('.test-btn').exists()).toBe(true)
    expect(wrapper.find('.test-btn').text()).toBe('Add Item')
  })
})
