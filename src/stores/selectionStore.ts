import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSelectionStore = defineStore('selection', () => {
  const selectedPlantId = ref<string | null>(null);

  function selectPlant(id: string): void {
    selectedPlantId.value = id;
  }

  function clearSelection(): void {
    selectedPlantId.value = null;
  }

  return { selectedPlantId, selectPlant, clearSelection };
});
