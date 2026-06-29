import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function getChatResponse(messages: { role: 'user' | 'assistant'; content: string }[], level: string) {
  const system = `You are an expert English tutor for ${level} level Portuguese speakers learning English.
You explain concepts clearly, give practical examples, and always correct mistakes kindly.
You can respond in Portuguese when needed to explain complex grammar, but prefer English for simple conversation.
Keep responses concise (max 3 paragraphs). Use emojis sparingly to be friendly.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system,
    messages,
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}
