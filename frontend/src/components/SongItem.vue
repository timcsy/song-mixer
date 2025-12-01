<template>
  <div
    class="song-item"
    :class="{ selected: isSelected, checked: isChecked }"
    @click="handleClick"
    @contextmenu.prevent="showContextMenu"
  >
    <input
      type="checkbox"
      :checked="isChecked"
      @click.stop="handleCheckboxClick"
      class="song-checkbox"
    />
    <div class="song-info">
      <input
        v-if="isEditing"
        ref="inputRef"
        v-model="editTitle"
        class="song-title-input"
        @click.stop
        @blur="saveTitle"
        @keydown.enter="saveTitle"
        @keydown.escape="cancelEdit"
      />
      <span
        v-else
        class="song-title"
        @dblclick.stop="startEdit"
        title="雙擊以重新命名"
      >{{ job.source_title || '未命名' }}</span>
      <span class="song-meta">
        <span v-if="job.original_duration" class="duration">
          {{ formatDuration(job.original_duration) }}
        </span>
        <span v-if="job.storage_size" class="storage-size">
          {{ formatFileSize(job.storage_size) }}
        </span>
        <span class="source-type">{{ job.source_type === 'youtube' ? 'YouTube' : '上傳' }}</span>
      </span>
    </div>
    <button
      v-if="showDelete"
      class="delete-btn"
      @click.stop="handleDelete"
      title="刪除"
    >
      ×
    </button>

    <!-- 右鍵選單 -->
    <Teleport to="body">
      <div
        v-if="contextMenuVisible"
        class="context-menu"
        :style="{ top: contextMenuY + 'px', left: contextMenuX + 'px' }"
        @click.stop
      >
        <button class="context-menu-item" @click="handleContextRename">
          重新命名
        </button>
        <button class="context-menu-item" @click="handleContextExport">
          {{ hasMultipleSelected ? `匯出 ${selectedCount} 首` : '匯出' }}
        </button>
        <button class="context-menu-item danger" @click="handleContextDelete">
          {{ hasMultipleSelected ? `刪除 ${selectedCount} 首` : '刪除' }}
        </button>
      </div>
      <div
        v-if="contextMenuVisible"
        class="context-menu-overlay"
        @click="hideContextMenu"
        @contextmenu.prevent="hideContextMenu"
      ></div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import type { CompletedJob } from '@/services/api'
import { formatDuration, formatFileSize } from '@/utils/format'

interface Props {
  job: CompletedJob
  isSelected?: boolean
  isChecked?: boolean
  showDelete?: boolean
  selectedJobIds?: ReadonlySet<string>
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false,
  isChecked: false,
  showDelete: true,
  selectedJobIds: () => new Set(),
})

const emit = defineEmits<{
  select: [jobId: string]
  toggle: [jobId: string]
  delete: [jobId: string]
  deleteSelected: []
  export: [jobId: string]
  exportSelected: []
  rename: [jobId: string, newTitle: string]
}>()

// 計算是否有多選
const hasMultipleSelected = computed(() => props.selectedJobIds.size > 1)
const selectedCount = computed(() => props.selectedJobIds.size)

// 編輯狀態
const isEditing = ref(false)
const editTitle = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

// 右鍵選單狀態
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)

function handleClick() {
  emit('select', props.job.id)
}

function handleCheckboxClick() {
  emit('toggle', props.job.id)
}

function handleDelete() {
  emit('delete', props.job.id)
}

function startEdit() {
  editTitle.value = props.job.source_title || ''
  isEditing.value = true
  nextTick(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
}

function saveTitle() {
  if (!isEditing.value) return
  isEditing.value = false
  const newTitle = editTitle.value.trim()
  if (newTitle && newTitle !== props.job.source_title) {
    emit('rename', props.job.id, newTitle)
  }
}

function cancelEdit() {
  isEditing.value = false
  editTitle.value = ''
}

// 右鍵選單
function showContextMenu(e: MouseEvent) {
  contextMenuX.value = e.clientX
  contextMenuY.value = e.clientY
  contextMenuVisible.value = true
}

function hideContextMenu() {
  contextMenuVisible.value = false
}

function handleContextRename() {
  hideContextMenu()
  startEdit()
}

function handleContextExport() {
  hideContextMenu()
  if (hasMultipleSelected.value) {
    emit('exportSelected')
  } else {
    emit('export', props.job.id)
  }
}

function handleContextDelete() {
  hideContextMenu()
  if (hasMultipleSelected.value) {
    emit('deleteSelected')
  } else {
    handleDelete()
  }
}
</script>

<style scoped>
.song-item {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #333;
  cursor: pointer;
  transition: background-color 0.15s;
}

.song-item:hover {
  background-color: #2a2a2a;
}

.song-item.selected {
  background-color: #3a3a3a;
  border-left: 3px solid #4a9eff;
}

.song-item.checked {
  background-color: #2d3748;
}

.song-checkbox {
  margin-right: 0.75rem;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.song-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.song-title {
  font-size: 0.9rem;
  color: #e0e0e0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: text;
}

.song-title-input {
  font-size: 0.9rem;
  color: #e0e0e0;
  background: #333;
  border: 1px solid #4a9eff;
  border-radius: 3px;
  padding: 0.15rem 0.3rem;
  width: 100%;
  outline: none;
}

.song-meta {
  display: flex;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: #888;
}

.duration {
  font-family: monospace;
}

.storage-size {
  color: #6b8aff;
  font-size: 0.7rem;
}

.source-type {
  text-transform: uppercase;
  font-size: 0.65rem;
  background: #444;
  padding: 0.1rem 0.3rem;
  border-radius: 2px;
}

.delete-btn {
  background: transparent;
  border: none;
  color: #888;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}

.song-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  color: #ff4444;
}

/* 右鍵選單 */
.context-menu {
  position: fixed;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  padding: 0.25rem 0;
  min-width: 120px;
  z-index: 1000;
}

.context-menu-item {
  display: block;
  width: 100%;
  padding: 0.5rem 1rem;
  background: transparent;
  border: none;
  color: #e0e0e0;
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s;
}

.context-menu-item:hover {
  background: #3a3a3a;
}

.context-menu-item.danger {
  color: #ff6b6b;
}

.context-menu-item.danger:hover {
  background: #3a2020;
}

.context-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
}
</style>
