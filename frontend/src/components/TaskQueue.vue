<template>
  <div class="task-queue" :class="{ 'drawer-open': drawerOpen }">
    <div class="queue-header">
      <span class="queue-title">處理中 ({{ jobs.length }})</span>
    </div>
    <div class="queue-items">
      <TaskItem
        v-for="job in jobs"
        :key="job.id"
        :job="job"
        @click="handleTaskClick"
        @cancel="handleTaskCancel"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ProcessingJob } from '@/services/api'
import TaskItem from './TaskItem.vue'

interface Props {
  jobs: readonly ProcessingJob[]
  drawerOpen: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  taskClick: [jobId: string]
  taskCancel: [jobId: string]
}>()

function handleTaskClick(jobId: string) {
  emit('taskClick', jobId)
}

function handleTaskCancel(jobId: string) {
  emit('taskCancel', jobId)
}
</script>

<style scoped>
.task-queue {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #1a1a1a;
  border-top: 1px solid #333;
  padding: 0.5rem 1rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  transition: left 0.3s ease;
  z-index: 50;
}

.task-queue.drawer-open {
  left: 300px;
}

.queue-header {
  flex-shrink: 0;
}

.queue-title {
  font-size: 0.8rem;
  color: #888;
  text-transform: uppercase;
}

.queue-items {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  flex: 1;
  padding: 0.25rem 0;
}

.queue-items::-webkit-scrollbar {
  height: 4px;
}

.queue-items::-webkit-scrollbar-track {
  background: transparent;
}

.queue-items::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 2px;
}

/* 手機版 */
@media (max-width: 768px) {
  .task-queue.drawer-open {
    left: 0;
  }
}
</style>
