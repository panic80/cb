export interface LLMModel {
  id: string;
  name: string;
  provider: 'openai' | 'google' | 'anthropic';
  description?: string;
}

export const LLM_MODELS: LLMModel[] = [
  // OpenAI Models (only real OpenAI models since RAG service only supports OpenAI)
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', description: 'Most advanced GPT-4 model with vision capabilities' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', description: 'Efficient and cost-effective GPT-4 model' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', description: 'High-performance GPT-4 model with latest training data' },
  { id: 'gpt-4', name: 'GPT-4', provider: 'openai', description: 'Original GPT-4 model with strong reasoning capabilities' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', description: 'Fast and efficient model for most tasks' },
];

/**
 * Get the display name for a model ID
 * @param modelId - The model ID stored in localStorage
 * @returns The display name for the model, or the ID itself if not found
 */
export const getModelDisplayName = (modelId: string | null): string => {
  if (!modelId) {
    return 'GPT-4o Mini'; // Default fallback
  }
  
  const model = LLM_MODELS.find(m => m.id === modelId);
  return model ? model.name : modelId;
};

/**
 * Get the default model ID
 */
export const DEFAULT_MODEL_ID = 'gpt-4o-mini';