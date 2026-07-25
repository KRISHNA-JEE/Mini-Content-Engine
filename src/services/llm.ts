const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT =
  "You are a creative director for product photography and lifestyle content. " +
  "Given a product name and a short description, write ONE vivid, concise image-generation " +
  "prompt (2-4 sentences) that an AI image model can use to create an appealing lifestyle or " +
  "UGC-style photo of the product. Describe the setting, lighting, mood, composition, and how " +
  "the product is presented. Do not mention camera brands, do not add quotation marks, and do " +
  "not include any preamble or explanation - respond with ONLY the prompt text itself.";

interface GroqChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/**
 * Turns product name + description into an image-generation prompt using Groq's
 * free-tier LLM API (OpenAI-compatible chat completions).
 */
export async function buildImagePrompt(productName: string, description: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable is not set");
  }

  const body = {
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Product: ${productName}\nDescription: ${description}` },
    ],
    temperature: 0.8,
  };

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`LLM request failed: ${response.status} ${response.statusText} ${errorText}`.trim());
  }

  const data = (await response.json()) as GroqChatResponse;
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("LLM returned an empty prompt");
  }

  return content;
}
