import "dotenv/config";
import { createInterface } from "node:readline";
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { ChatOllama } from "@langchain/ollama";
import { SystemMessage, HumanMessage, ToolMessage, BaseMessage } from "@langchain/core/messages";

const cityWeatherData: Record<string, { temperature: number; condition: string }> = {
  Cairo: { temperature: 25, condition: "Sunny" },
  Alexandria: { temperature: 19, condition: "Light Rain" },
  Riyadh: { temperature: 42, condition: "Hot" },
  Tokyo: { temperature: 21, condition: "Clear" },
};

const fetchWeather = tool(
  async ({ city }: { city: string }) => {
    const data = cityWeatherData[city] ?? { temperature: 28, condition: "Clear" };
    return JSON.stringify({ city, temperature: data.temperature, condition: data.condition });
  },
  {
    name: "fetchWeather",
    description: "Get the current weather for a specific city.",
    schema: z.object({ city: z.string() }),
  }
);

const model = new ChatOllama({
  model: "llama3.1",
  temperature: 0,
});

const modelWithTools = model.bindTools([fetchWeather]);

const MAX_MESSAGES = 6;

const chatHistory: BaseMessage[] = [
  new SystemMessage(
    "You are a helpful weather assistant. Use the fetchWeather tool for questions about current conditions in a specific city, and rely on the conversation history to resolve references like 'there' or 'those two cities'."
  ),
];

function pruneHistory(history: BaseMessage[], maxMessages: number) {
  if (history.length <= maxMessages + 1) return;

  let startIndex = history.length - maxMessages;
  while (history[startIndex] instanceof ToolMessage) {
    startIndex--;
  }

  history.splice(1, startIndex - 1);
}

async function handleUserInput(input: string) {
  chatHistory.push(new HumanMessage(input));

  let response = await modelWithTools.invoke(chatHistory);
  chatHistory.push(response);

  if (response.tool_calls?.length) {
    for (const call of response.tool_calls) {
      console.log(`[System] Caught LLM request to run tool ${call.name}.`);
      const result = await fetchWeather.invoke(call.args as { city: string });
      chatHistory.push(new ToolMessage({ content: result, tool_call_id: call.id! }));
    }

    response = await modelWithTools.invoke(chatHistory);
    chatHistory.push(response);
  }

  console.log(response.content);
  pruneHistory(chatHistory, MAX_MESSAGES);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

function askNext() {
  rl.question("You: ", async (input) => {
    if (input.trim().toLowerCase() === "exit") {
      rl.close();
      return;
    }

    await handleUserInput(input);
    askNext();
  });
}

askNext();