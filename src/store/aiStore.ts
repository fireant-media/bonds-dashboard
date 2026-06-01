import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AIModelInfo } from "../api/ai";
import { getAIStatus, listAIModels } from "../api/ai";

interface AIState {
  // Configuration loaded from server
  configured: boolean;
  baseUrl: string;
  defaultModel: string;
  defaultSystemPrompt: string;

  // Available chat models (from /api/ai/models)
  models: AIModelInfo[];
  isLoadingModels: boolean;
  modelsError: string | null;

  // User preferences (persisted)
  selectedModel: string;
  systemPrompt: string;

  // Status load state
  isLoadingStatus: boolean;
  statusError: string | null;

  // Actions
  refreshStatus: () => Promise<void>;
  refreshModels: (force?: boolean) => Promise<void>;
  setSelectedModel: (modelId: string) => void;
  setSystemPrompt: (prompt: string) => void;
  resetSystemPrompt: () => void;
}

const STORAGE_KEY = "sentinel_ai_preferences";
const CLIENT_FALLBACK_AI_MODEL = "gpt-4o-mini";

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      configured: false,
      baseUrl: "",
      defaultModel: CLIENT_FALLBACK_AI_MODEL,
      defaultSystemPrompt: "",

      models: [],
      isLoadingModels: false,
      modelsError: null,

      selectedModel: "",
      systemPrompt: "",

      isLoadingStatus: false,
      statusError: null,

      refreshStatus: async () => {
        set({ isLoadingStatus: true, statusError: null });
        try {
          const status = await getAIStatus();
          const current = get();
          const gatewayChanged = current.baseUrl !== status.baseUrl;
          set({
            configured: status.configured,
            baseUrl: status.baseUrl,
            defaultModel: status.defaultModel || current.defaultModel || CLIENT_FALLBACK_AI_MODEL,
            defaultSystemPrompt: status.defaultSystemPrompt,
            selectedModel: status.defaultModel || current.defaultModel || (gatewayChanged ? "" : current.selectedModel) || CLIENT_FALLBACK_AI_MODEL,
            systemPrompt: current.systemPrompt || status.defaultSystemPrompt,
            isLoadingStatus: false,
          });
        } catch (err: any) {
          set({
            isLoadingStatus: false,
            statusError: err?.message || "Failed to load AI status",
          });
        }
      },

      refreshModels: async (force = false) => {
        set({ isLoadingModels: true, modelsError: null });
        try {
          const data = await listAIModels(force);
          const current = get();
          const models = data.models || [];
          const hasModel = (modelId: string) => models.some((m) => m.id === modelId);
          const serverDefault = data.defaultModel || current.defaultModel || CLIENT_FALLBACK_AI_MODEL;
          const selected =
            (serverDefault && (models.length === 0 || hasModel(serverDefault)) ? serverDefault : "") ||
            (current.selectedModel && hasModel(current.selectedModel) ? current.selectedModel : "") ||
            models[0]?.id ||
            "";
          set({
            models,
            defaultModel: serverDefault,
            selectedModel: selected,
            isLoadingModels: false,
            modelsError: data.error || null,
          });
        } catch (err: any) {
          set({
            isLoadingModels: false,
            modelsError: err?.message || "Failed to load AI models",
          });
        }
      },

      setSelectedModel: (modelId: string) => set({ selectedModel: modelId }),
      setSystemPrompt: (prompt: string) => set({ systemPrompt: prompt }),
      resetSystemPrompt: () => set({ systemPrompt: get().defaultSystemPrompt }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        selectedModel: state.selectedModel,
        systemPrompt: state.systemPrompt,
      }),
    },
  ),
);
