import "dotenv/config";
import * as readline from "node:readline";
import * as process from "node:process";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import { graph } from "./agent.js";

if (!process.env.GROQ_API_KEY) {
  console.error("Error: GROQ_API_KEY is not set in .env");
  process.exit(1);
}

const history: BaseMessage[] = [];

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer: string) => { rl.close(); resolve(answer); });
  });
}

function handleError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.log("\n------------------------------------------------------------");
  if (msg.includes("429") || msg.includes("quota") || msg.includes("limit")) {
    console.error(" Rate limit exceeded. Please wait a moment and try again.");
  } else if (msg.includes("401") || msg.includes("API key") || msg.includes("unauthorized")) {
    console.error(" Invalid GROQ_API_KEY. Please check your .env file.");
  } else {
    console.error(` ${msg}`);
  }
  console.log("------------------------------------------------------------\n");
}

async function main() {
  console.log("================================");
  console.log("    The Weather Agent CLI       ");
  console.log("================================");
  console.log("Type 'exit' to quit.\n");

  while (true) {
    const input = (await ask("You: ")).trim();
    if (!input) continue;
    if (input.toLowerCase() === "exit") { console.log("Goodbye!"); break; }

    history.push(new HumanMessage(input));
    console.log("Thinking...");

    try {
      const state = await graph.invoke({ messages: history });
      history.length = 0;
      history.push(...state.messages);
      console.log(`\nAgent: ${state.messages.at(-1)?.content}\n`);
    } catch (err) {
      history.pop();
      handleError(err);
    }
  }
}

main();
