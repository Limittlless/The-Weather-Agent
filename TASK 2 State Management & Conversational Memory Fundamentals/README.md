# Stateful Weather Agent

A CLI weather assistant that remembers the conversation across turns, resolving follow-up questions using prior context.

## Requirements

- Node.js 18+
- [Ollama](https://ollama.com) installed

## How to Run

1. Start Ollama:
```bash
ollama serve
```

2. Pull the model:
```bash
ollama pull llama3.1
```

3. Install dependencies:
```bash
npm install
```

4. Run the script:
```bash
npx tsx stateful-weather-agent.ts
```

5. Type your questions, and type `exit` to quit.