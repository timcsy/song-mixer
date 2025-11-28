<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  progress: number;
  stage: string;
  status: string;
}>();

const statusInfo = computed(() => {
  switch (props.status) {
    case 'pending':
      return { text: '等待處理', icon: '⏳', estimatedTime: '準備中...' };
    case 'downloading':
      return { text: '下載中', icon: '⬇️', estimatedTime: estimateTime(0, 20) };
    case 'separating':
      return { text: '分離人聲', icon: '🎵', estimatedTime: estimateTime(20, 70) };
    case 'merging':
      return { text: '影片擷取', icon: '🎬', estimatedTime: estimateTime(70, 90) };
    default:
      return { text: '處理中', icon: '⚙️', estimatedTime: '' };
  }
});

function estimateTime(startPercent: number, endPercent: number): string {
  const phaseProgress = props.progress - startPercent;
  const phaseTotal = endPercent - startPercent;

  if (phaseProgress <= 0) return '計算中...';

  // 根據階段估算剩餘時間
  const stageEstimates: Record<string, number> = {
    downloading: 30,   // 30 秒下載
    separating: 120,   // 2 分鐘分離
    merging: 30,       // 30 秒合併
  };

  const totalSeconds = stageEstimates[props.status] || 60;
  const elapsedPercent = phaseProgress / phaseTotal;
  const remainingSeconds = Math.ceil(totalSeconds * (1 - elapsedPercent));

  if (remainingSeconds < 60) {
    return `約 ${remainingSeconds} 秒`;
  }
  const mins = Math.ceil(remainingSeconds / 60);
  return `約 ${mins} 分鐘`;
}

const stages = [
  { key: 'downloading', label: '下載', icon: '⬇️' },
  { key: 'separating', label: '分離', icon: '🎵' },
  { key: 'merging', label: '擷取', icon: '🎬' },
];

const currentStageIndex = computed(() => {
  return stages.findIndex(s => s.key === props.status);
});
</script>

<template>
  <div class="progress-bar-container">
    <!-- 主進度條 -->
    <div class="main-progress">
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
      </div>
      <div class="progress-info">
        <span class="progress-percent">{{ progress }}%</span>
        <span class="progress-stage">{{ stage }}</span>
      </div>
    </div>

    <!-- 階段指示器 -->
    <div class="stages">
      <div
        v-for="(stageItem, index) in stages"
        :key="stageItem.key"
        class="stage"
        :class="{
          active: stageItem.key === status,
          completed: index < currentStageIndex,
          pending: index > currentStageIndex
        }"
      >
        <span class="stage-icon">{{ stageItem.icon }}</span>
        <span class="stage-label">{{ stageItem.label }}</span>
      </div>
    </div>

    <!-- 預估時間 -->
    <div class="estimated-time" v-if="statusInfo.estimatedTime">
      {{ statusInfo.estimatedTime }}
    </div>
  </div>
</template>

<style scoped>
.progress-bar-container {
  padding: 1rem 0;
  width: 100%;
}

.main-progress {
  margin-bottom: 1.5rem;
}

.progress-track {
  width: 100%;
  height: 12px;
  background: #e0e0e0;
  border-radius: 6px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4a90d9, #6bb3f0);
  border-radius: 6px;
  transition: width 0.3s ease;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
  font-size: 0.875rem;
}

.progress-percent {
  font-weight: 600;
  color: #4a90d9;
}

.progress-stage {
  color: #666;
}

.stages {
  display: flex;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  flex: 1;
  position: relative;
}

.stage::after {
  content: '';
  position: absolute;
  top: 1rem;
  left: 60%;
  width: calc(80% - 1rem);
  height: 2px;
  background: #e0e0e0;
}

.stage:last-child::after {
  display: none;
}

.stage.completed::after {
  background: #4a90d9;
}

.stage-icon {
  font-size: 1.5rem;
  opacity: 0.3;
  transition: opacity 0.3s;
}

.stage.active .stage-icon,
.stage.completed .stage-icon {
  opacity: 1;
}

.stage.active .stage-icon {
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
}

.stage-label {
  font-size: 0.75rem;
  color: #999;
}

.stage.active .stage-label {
  color: #4a90d9;
  font-weight: 600;
}

.stage.completed .stage-label {
  color: #4a90d9;
}

.estimated-time {
  text-align: center;
  font-size: 0.875rem;
  color: #666;
  margin-top: 0.5rem;
}
</style>
