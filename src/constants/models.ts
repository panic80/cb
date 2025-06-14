export interface LLMModel {
  id: string;
  name: string;
  provider: 'openai' | 'google' | 'anthropic';
  description?: string;
}

export const LLM_MODELS: LLMModel[] = [
  // OpenAI Models
  { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai', description: 'Latest GPT-4.1 model with enhanced capabilities' },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', provider: 'openai', description: 'Efficient variant of GPT-4.1' },
  { id: 'o3', name: 'O3', provider: 'openai', description: 'Advanced reasoning model for complex tasks' },
  { id: 'o4-mini', name: 'O4 Mini', provider: 'openai', description: 'Fast, cost-efficient reasoning model' },
  
  // Google Models
  { id: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash', provider: 'google', description: 'Latest Gemini 2.5 Flash with fast performance' },
  { id: 'gemini-2.5-pro-preview-06-05', name: 'Gemini 2.5 Pro', provider: 'google', description: 'Most advanced Gemini 2.5 Pro model' },
  
  // Anthropic Models
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', description: 'Latest Claude Sonnet 4 with superior reasoning' },
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
export const DEFAULT_MODEL_ID = 'gpt-4.1-mini';