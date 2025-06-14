import { FollowUpQuestion, Source } from '@/types/chat';

interface FollowUpGenerationParams {
  userQuestion: string;
  aiResponse: string;
  sources?: Source[];
  conversationHistory?: Array<{ role: 'user' | 'assistant', content: string }>;
}

interface FollowUpResponse {
  followUpQuestions: FollowUpQuestion[];
}

/**
 * Generate contextual follow-up questions using the dedicated follow-up endpoint
 */
export const generateFollowUpQuestions = async (
  params: FollowUpGenerationParams
): Promise<FollowUpQuestion[]> => {
  const { userQuestion, aiResponse, sources = [], conversationHistory = [] } = params;

  try {
    // Call the dedicated follow-up endpoint
    const response = await fetch('/api/v2/followup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userQuestion,
        aiResponse,
        sources,
        conversationHistory,
        model: localStorage.getItem('selectedLLMModel') || 'gpt-4',
        provider: localStorage.getItem('selectedLLMProvider') || 'openai'
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.followUpQuestions || [];

  } catch (error) {
    console.error('Error generating follow-up questions:', error);
    // Return fallback questions based on context analysis
    return generateFallbackQuestions(userQuestion, aiResponse, sources);
  }
};

/**
 * Create a specialized prompt for generating follow-up questions
 */
const createFollowUpPrompt = (
  userQuestion: string,
  aiResponse: string,
  sources: Source[],
  conversationHistory: Array<{ role: 'user' | 'assistant', content: string }>
): string => {
  const sourceContext = sources.length > 0 
    ? `\n\nSources referenced: ${sources.map(s => s.reference || 'Document').join(', ')}`
    : '';

  const historyContext = conversationHistory.length > 0
    ? `\n\nRecent conversation context:\n${conversationHistory.slice(-4).map(h => `${h.role}: ${h.content.substring(0, 100)}...`).join('\n')}`
    : '';

  return `You are a helpful assistant specialized in generating contextual follow-up questions. Based on the conversation below, generate 2-3 relevant follow-up questions that would help the user continue learning or get more specific information.

User's Question: "${userQuestion}"

AI Response: "${aiResponse}"${sourceContext}${historyContext}

Please generate follow-up questions in the following JSON format:
{
  "questions": [
    {
      "question": "Specific follow-up question text",
      "category": "clarification|related|practical|explore",
      "confidence": 0.9
    }
  ]
}

Focus on:
- Clarification questions for unclear aspects
- Related topics that might be relevant
- Practical application questions
- Questions that explore deeper into the subject

Generate questions that are:
- Specific and actionable
- Relevant to the context
- Naturally conversational
- Helpful for learning more

Return only the JSON response.`;
};

/**
 * Parse AI response to extract follow-up questions
 */
const parseFollowUpQuestions = (response: string): FollowUpQuestion[] => {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const questions = parsed.questions || [];

    return questions.map((q: any, index: number) => ({
      id: `followup-${Date.now()}-${index}`,
      question: q.question || '',
      category: q.category || 'related',
      confidence: q.confidence || 0.7
    })).filter((q: FollowUpQuestion) => q.question.trim().length > 0);

  } catch (error) {
    console.error('Error parsing follow-up questions:', error);
    // Try to extract questions from plain text as fallback
    return extractQuestionsFromText(response);
  }
};

/**
 * Extract questions from plain text as fallback
 */
const extractQuestionsFromText = (text: string): FollowUpQuestion[] => {
  const lines = text.split('\n');
  const questions: FollowUpQuestion[] = [];

  lines.forEach((line, index) => {
    // Look for lines that end with ? or start with question indicators
    const trimmed = line.trim();
    if (trimmed.endsWith('?') && trimmed.length > 10) {
      // Remove common prefixes
      const cleanQuestion = trimmed
        .replace(/^\d+\.\s*/, '')
        .replace(/^[-*]\s*/, '')
        .replace(/^Q:\s*/i, '')
        .trim();

      if (cleanQuestion.length > 10) {
        questions.push({
          id: `followup-text-${Date.now()}-${index}`,
          question: cleanQuestion,
          category: 'related',
          confidence: 0.6
        });
      }
    }
  });

  return questions.slice(0, 3); // Limit to 3 questions
};

/**
 * Generate fallback questions when AI generation fails
 */
const generateFallbackQuestions = (
  userQuestion: string,
  aiResponse: string,
  sources: Source[]
): FollowUpQuestion[] => {
  const fallbackQuestions: FollowUpQuestion[] = [];

  // Analyze the content to generate contextual questions
  const questionLower = userQuestion.toLowerCase();
  const responseLower = aiResponse.toLowerCase();

  // Policy/travel specific fallbacks
  if (questionLower.includes('travel') || responseLower.includes('travel')) {
    fallbackQuestions.push({
      id: 'fallback-travel-1',
      question: 'What documentation is required for this type of travel?',
      category: 'practical',
      confidence: 0.5
    });
  }

  if (questionLower.includes('claim') || responseLower.includes('claim')) {
    fallbackQuestions.push({
      id: 'fallback-claim-1',
      question: 'What is the timeline for submitting this claim?',
      category: 'practical',
      confidence: 0.5
    });
  }

  if (questionLower.includes('allowance') || responseLower.includes('allowance')) {
    fallbackQuestions.push({
      id: 'fallback-allowance-1',
      question: 'Are there any restrictions or conditions for this allowance?',
      category: 'clarification',
      confidence: 0.5
    });
  }

  // Generic fallbacks
  if (fallbackQuestions.length === 0) {
    fallbackQuestions.push(
      {
        id: 'fallback-generic-1',
        question: 'Can you provide more specific examples?',
        category: 'clarification',
        confidence: 0.4
      },
      {
        id: 'fallback-generic-2',
        question: 'What are the next steps I should take?',
        category: 'practical',
        confidence: 0.4
      }
    );
  }

  return fallbackQuestions.slice(0, 2); // Limit fallback questions
};

export default {
  generateFollowUpQuestions
};