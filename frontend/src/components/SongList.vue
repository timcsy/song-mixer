<template>
  <div class="song-list">
    <div v-if="jobs.length === 0" class="empty-list">
      <EmptyState
        title="尚無已完成歌曲"
        description="處理完成的歌曲會顯示在這裡"
      />
    </div>
    <div v-else class="list-container">
      <div class="list-header" v-if="showBatchActions">
        <label class="select-all">
          <input
            ref="selectAllCheckbox"
            type="checkbox"
            :checked="allSelected"
            @change="toggleSelectAll"
          />
          <span>{{ selectedCount }} 首已選</span>
        </label>

        <div class="list-tools">
          <!-- 排序／隨機後短暫顯示的復原 -->
          <button v-if="undoState" class="undo-btn" @click="undoReorder">
            {{ undoState.label }} · 復原
          </button>

          <button
            class="tool-btn"
            :disabled="jobs.length < 2"
            title="隨機排序"
            aria-label="隨機排序"
            @click="handleShuffle"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="M15 15l6 6" /><path d="M4 4l5 5" />
            </svg>
          </button>

          <div class="sort-menu-wrapper">
            <button
              class="tool-btn"
              :class="{ active: sortMenuOpen }"
              :disabled="jobs.length < 2"
              title="排序"
              aria-label="排序"
              aria-haspopup="menu"
              :aria-expanded="sortMenuOpen"
              @click="sortMenuOpen = !sortMenuOpen"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 6h13" /><path d="M3 12h9" /><path d="M3 18h5" /><path d="M18 9v12" /><path d="m15 18 3 3 3-3" />
              </svg>
            </button>
            <div v-if="sortMenuOpen" class="sort-menu" role="menu">
              <template v-for="group in sortOptions" :key="group.key">
                <div class="sort-menu-label">{{ group.label }}</div>
                <button
                  v-for="opt in group.options"
                  :key="opt.direction"
                  class="sort-menu-item"
                  role="menuitem"
                  @click="handleSort(group.key, opt.direction, `${group.label}：${opt.label}`)"
                >
                  {{ opt.label }}
                </button>
              </template>
            </div>
            <div v-if="sortMenuOpen" class="sort-menu-overlay" @click="sortMenuOpen = false"></div>
          </div>
        </div>
      </div>
      <div ref="listEl" class="list-items">
        <SongItem
          v-for="job in jobs"
          :key="job.id"
          :job="job"
          :isSelected="job.id === selectedJobId"
          :isChecked="selectedJobIds.has(job.id)"
          :selectedJobIds="selectedJobIds"
          :draggable="reorderable"
          @select="$emit('select', $event)"
          @toggle="$emit('toggle', $event)"
          @delete="$emit('delete', $event)"
          @deleteSelected="$emit('deleteSelected')"
          @export="$emit('export', $event)"
          @exportSelected="$emit('exportSelected')"
          @rename="(id, title) => $emit('rename', id, title)"
          @move="handleMove"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import Sortable from 'sortablejs'
import type { CompletedJob } from '@/services/api'
import { useJobManager, type SongSortKey, type SortDirection } from '@/composables/useJobManager'
import SongItem from './SongItem.vue'
import EmptyState from './EmptyState.vue'

interface Props {
  jobs: readonly CompletedJob[]
  selectedJobId?: string | null
  selectedJobIds?: ReadonlySet<string>
  showBatchActions?: boolean
  /** 是否允許拖曳與重新排序 */
  reorderable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  selectedJobId: null,
  selectedJobIds: () => new Set(),
  showBatchActions: true,
  reorderable: true,
})

const emit = defineEmits<{
  select: [jobId: string]
  toggle: [jobId: string]
  delete: [jobId: string]
  deleteSelected: []
  export: [jobId: string]
  exportSelected: []
  rename: [jobId: string, newTitle: string]
  selectAll: []
  deselectAll: []
}>()

const { moveSong, moveSongsTo, shuffleSongs, sortSongs, reorderSongs } = useJobManager()

const selectAllCheckbox = ref<HTMLInputElement | null>(null)

const selectedCount = computed(() => props.selectedJobIds.size)
const allSelected = computed(() =>
  props.jobs.length > 0 && props.selectedJobIds.size === props.jobs.length
)
const someSelected = computed(() => props.selectedJobIds.size > 0)

// 更新 indeterminate 狀態
watch([someSelected, allSelected], () => {
  if (selectAllCheckbox.value) {
    selectAllCheckbox.value.indeterminate = someSelected.value && !allSelected.value
  }
})

function toggleSelectAll() {
  if (allSelected.value) {
    emit('deselectAll')
  } else {
    emit('selectAll')
  }
}

// ========== 排序選單 ==========

const sortMenuOpen = ref(false)

const sortOptions: {
  key: SongSortKey
  label: string
  options: { direction: SortDirection; label: string }[]
}[] = [
  { key: 'title', label: '標題', options: [{ direction: 'asc', label: 'A → Z' }, { direction: 'desc', label: 'Z → A' }] },
  { key: 'createdAt', label: '新增時間', options: [{ direction: 'desc', label: '新 → 舊' }, { direction: 'asc', label: '舊 → 新' }] },
  { key: 'duration', label: '時長', options: [{ direction: 'asc', label: '短 → 長' }, { direction: 'desc', label: '長 → 短' }] },
  { key: 'size', label: '檔案大小', options: [{ direction: 'asc', label: '小 → 大' }, { direction: 'desc', label: '大 → 小' }] },
]

// ========== 復原（隨機／排序會覆蓋手動排好的順序） ==========

const UNDO_TIMEOUT = 6000
const undoState = ref<{ label: string; previousIds: string[] } | null>(null)
let undoTimer: number | null = null

function rememberForUndo(label: string) {
  if (undoTimer !== null) clearTimeout(undoTimer)
  undoState.value = { label, previousIds: props.jobs.map(j => j.id) }
  undoTimer = window.setTimeout(() => {
    undoState.value = null
    undoTimer = null
  }, UNDO_TIMEOUT)
}

function undoReorder() {
  if (!undoState.value) return
  const { previousIds } = undoState.value
  undoState.value = null
  if (undoTimer !== null) {
    clearTimeout(undoTimer)
    undoTimer = null
  }
  reorderSongs(previousIds)
}

function handleShuffle() {
  rememberForUndo('已隨機排序')
  shuffleSongs()
}

function handleSort(key: SongSortKey, direction: SortDirection, label: string) {
  sortMenuOpen.value = false
  rememberForUndo(`已依${label}`)
  sortSongs(key, direction)
}

function handleMove(ids: string[], position: 'top' | 'bottom') {
  moveSongsTo(ids, position)
}

// ========== 拖曳排序 ==========

const listEl = ref<HTMLElement | null>(null)
let sortable: Sortable | null = null

function destroySortable() {
  sortable?.destroy()
  sortable = null
}

// 列表容器只在有歌曲時存在，隨之建立／銷毀
watch([listEl, () => props.reorderable], ([el, enabled]) => {
  destroySortable()
  if (!el || !enabled) return

  sortable = Sortable.create(el, {
    handle: '.drag-handle',
    animation: 150,
    ghostClass: 'song-drag-ghost',
    chosenClass: 'song-drag-chosen',
    dragClass: 'song-drag-dragging',
    // 拖到列表上下邊緣時自動捲動
    scroll: true,
    scrollSensitivity: 60,
    scrollSpeed: 12,
    onEnd(evt) {
      const { oldIndex, newIndex, item, from } = evt
      if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return

      // SortableJS 已直接移動 DOM；先還原，交由 Vue 依資料重新渲染，避免兩者不同步
      from.removeChild(item)
      from.insertBefore(item, from.children[oldIndex] ?? null)

      moveSong(oldIndex, newIndex)
    },
  })
}, { flush: 'post' })

onBeforeUnmount(() => {
  destroySortable()
  if (undoTimer !== null) clearTimeout(undoTimer)
})
</script>

<style scoped>
.song-list {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.empty-list {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.list-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem 0.35rem 1rem;
  border-bottom: 1px solid #333;
  background: #1a1a1a;
}

.select-all {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: #888;
  cursor: pointer;
  white-space: nowrap;
}

.select-all input {
  cursor: pointer;
}

.list-tools {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #999;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.tool-btn:hover:not(:disabled),
.tool-btn.active {
  background: #2a2a2a;
  color: #e0e0e0;
}

.tool-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.undo-btn {
  background: transparent;
  border: none;
  color: #4a9eff;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0.25rem 0.4rem;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.undo-btn:hover {
  background: #1e2a3a;
}

.sort-menu-wrapper {
  position: relative;
}

.sort-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 140px;
  padding: 0.25rem 0;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 1001;
}

.sort-menu-label {
  padding: 0.4rem 0.9rem 0.15rem;
  font-size: 0.7rem;
  color: #777;
}

.sort-menu-item {
  display: block;
  width: 100%;
  padding: 0.35rem 0.9rem 0.35rem 1.4rem;
  background: transparent;
  border: none;
  color: #e0e0e0;
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
}

.sort-menu-item:hover {
  background: #3a3a3a;
}

.sort-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
}

.list-items {
  flex: 1;
  overflow-y: auto;
}

/* 拖曳中的樣式（SortableJS 加在 SongItem 根元素上，需穿透 scoped） */
.list-items :deep(.song-drag-ghost) {
  opacity: 0.35;
  background: #1e2a3a;
}

.list-items :deep(.song-drag-chosen) {
  background: #2a2a2a;
}
</style>
