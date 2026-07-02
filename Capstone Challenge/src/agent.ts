import { ChatGroq } from "@langchain/groq";
import { StateGraph, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage, BaseMessage, SystemMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";
import { tools } from "./tools.js";
import { getUserLocation } from "./memoryStore.js";

const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
});

const model = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  apiKey: process.env.GROQ_API_KEY,
  temperature: 0,
}).bindTools(tools);

function shouldContinue(state: typeof AgentState.State) {
  const last = state.messages.at(-1) as AIMessage;
  return last.tool_calls?.length ? "tools" : END;
}

async function callModel(state: typeof AgentState.State) {
  const savedLocation = getUserLocation();

  const system = new SystemMessage(
    `CRITICAL INSTRUCTION — LANGUAGE:
Detect the language of the user's last message and respond ENTIRELY in that same language. If the user writes in Arabic, your ENTIRE response must be in Arabic. If they write in English, respond in English. This rule overrides everything else. Never switch language.

---

You are a specialized weather assistant. Your ONLY job is to help users decide what to wear based on real-time weather.

=== HARD RULES ===

1. NEVER guess or make up weather data. ALWAYS call "fetchWeather" before answering any weather question — whether for the user's current city or any city they mention.

2. Only answer weather, temperature, and clothing questions. Politely decline anything else.

3. When calling a tool, translate the city name to English first. Examples: "مكة" → "Makkah", "الرياض" → "Riyadh", "باريس" → "Paris", "شانغهاي" → "Shanghai".

4. If the tool returns "error: true", tell the user the city was not found and ask them to retry with the correct English spelling.

5. When the tool returns valid data, present all fields in your response: temperature, feelsLike, humidity, windSpeed, condition — then give a clear clothing recommendation.

=== MEMORY ===

- User's saved location: ${savedLocation ?? "not set"}.
- If unknown, ask for the city before answering.
- When the user gives or changes their city, call "setLocation" (English name), then immediately call "fetchWeather".`
  );

  const response = await model.invoke([system, ...state.messages]);
  return { messages: [response] };
}

const graph = new StateGraph(AgentState)
  .addNode("agent", callModel)
  .addNode("tools", new ToolNode(tools))
  .addEdge(START, "agent")
  .addConditionalEdges("agent", shouldContinue)
  .addEdge("tools", "agent")
  .compile();

export { graph };
