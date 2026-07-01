import * as fs from 'fs';
import * as path from 'path';

const memoryFilePath = path.join(process.cwd(), 'memory.json');

interface MemoryData {
  userLocation?: string;
}

function loadMemory(): MemoryData {
  try {
    if (fs.existsSync(memoryFilePath)) {
      return JSON.parse(fs.readFileSync(memoryFilePath, 'utf8'));
    }
  } catch {
    // silent fail — return empty
  }
  return {};
}

function saveMemory(data: MemoryData): void {
  try {
    fs.writeFileSync(memoryFilePath, JSON.stringify(data, null, 2), 'utf8');
  } catch {
    // silent fail
  }
}

export function getUserLocation(): string | undefined {
  return loadMemory().userLocation;
}

export function setUserLocation(location: string): void {
  const memory = loadMemory();
  memory.userLocation = location;
  saveMemory(memory);
}
