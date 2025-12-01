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
      </div>
      <div class="list-items">
        <SongItem
          v-for="job in jobs"
          :key="job.id"
          :job="job"
          :isSelected="job.id === selectedJobId"
          :isChecked="selectedJobIds.has(job.id)"
          :selectedJobIds="selectedJobIds"
          @select="$emit('select', $event)"
          @toggle="$emit('toggle', $event)"
          @delete="$emit('delete', $event)"
          @deleteSelected="$emit('deleteSelected')"
          @export="$emit('export', $event)"
          @exportSelected="$emit('exportSelected')"
          @rename="(id, title) => $emit('rename', id, title)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CompletedJob } from '@/services/api'
import SongItem from './SongItem.vue'
import EmptyState from './EmptyState.vue'

interface Props {
  jobs: readonly CompletedJob[]
  selectedJobId?: string | null
  selectedJobIds?: ReadonlySet<string>
  showBatchActions?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  selectedJobId: null,
  selectedJobIds: () => new Set(),
  showBatchActions: true,
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
  padding: 0.5rem 1rem;
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
}

.select-all input {
  cursor: pointer;
}

.list-items {
  flex: 1;
  overflow-y: auto;
}
</style>
