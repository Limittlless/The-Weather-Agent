import "dotenv/config";
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, ToolMessage, BaseMessage } from "@langchain/core/messages";

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

const WeatherReportExtraction = z.object({
  reports: z.array(
    z.object({
      cityName: z.string(),
      temp: z.number(),
      conditions: z.string(),
    })
  ),
});

type WeatherReportExtractionType = z.infer<typeof WeatherReportExtraction>;

const model = new ChatOllama({
  model: "llama3.1",
  temperature: 0,
});

const weatherPrompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a precise weather assistant. Use the fetchWeather tool whenever a question depends on current conditions in a specific city, and give clear, concise answers."],
  new MessagesPlaceholder("messages"),
]);

async function askAboutWeather(question: string) {
  const modelWithTools = model.bindTools([fetchWeather]);
  const chain = weatherPrompt.pipe(modelWithTools);

  const messages: BaseMessage[] = [new HumanMessage(question)];
  const response = await chain.invoke({ messages });
  messages.push(response);

  if (!response.tool_calls?.length) {
    console.log(response.content);
    return;
  }

  const toolMessages = await Promise.all(
    response.tool_calls.map(async (call) => {
      console.log(`[System] Caught LLM request to run tool ${call.name}.`);
      const validatedArgs = fetchWeather.schema.parse(call.args);
      const result = await fetchWeather.invoke(validatedArgs);
      return new ToolMessage({ content: result, tool_call_id: call.id! });
    })
  );

  messages.push(...toolMessages);

  const stream = await chain.stream({ messages });
  for await (const chunk of stream) {
    process.stdout.write(String(chunk.content));
  }
  console.log();
}

async function extractWeatherReports(input: string): Promise<WeatherReportExtractionType> {
  const structuredModel = model.withStructuredOutput(WeatherReportExtraction);
  return structuredModel.invoke(input);
}

async function chatStream(input: string) {
  const stream = await model.stream([new HumanMessage(input)]);
  for await (const chunk of stream) {
    process.stdout.write(String(chunk.content));
  }
  console.log();
}

async function main() {
  await askAboutWeather("Should I pack a heavy jacket for my trip to Cairo today?");

  const reports = await extractWeatherReports(
    "Log the following stats into the database: Riyadh is hot at 42C, Tokyo is clear at 21C."
  );
  console.log(JSON.stringify(reports, null, 2));

  await chatStream("Why does the humidity feel different near coastal cities compared to inland deserts?");
}

main().catch(() => process.exit(1));