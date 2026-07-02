import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { setUserLocation } from "./memoryStore.js";

const WMO_CONDITIONS: Record<number, string> = {
  0: "Clear Sky", 1: "Mainly Clear", 2: "Partly Cloudy", 3: "Overcast",
  45: "Foggy", 48: "Foggy",
  51: "Light Drizzle", 53: "Moderate Drizzle", 55: "Heavy Drizzle",
  61: "Light Rain", 63: "Moderate Rain", 65: "Heavy Rain",
  71: "Light Snow", 73: "Moderate Snow", 75: "Heavy Snow",
  80: "Light Showers", 81: "Moderate Showers", 82: "Violent Showers",
  95: "Thunderstorm", 96: "Thunderstorm with Hail", 99: "Thunderstorm with Hail",
};

async function fetchLiveWeather(city: string): Promise<string> {
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`
  );
  const geoData: any = await geoRes.json();

  if (!geoData.results?.length) {
    return JSON.stringify({
      error: true,
      message: `City "${city}" not found. Please check the spelling or try the English name.`
    });
  }

  const { latitude, longitude, name, country } = geoData.results[0];

  const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code`
  );
  const weatherData: any = await weatherRes.json();

  if (!weatherData.current) {
    return JSON.stringify({
      error: true,
      message: `Could not retrieve weather data for "${city}". Please try again later.`
    });
  }

  const c = weatherData.current;
  return JSON.stringify({
    error: false,
    city: name,
    country,
    temp: Math.round(c.temperature_2m),
    feelsLike: Math.round(c.apparent_temperature),
    humidity: c.relative_humidity_2m,
    windSpeed: Math.round(c.wind_speed_10m),
    condition: WMO_CONDITIONS[c.weather_code] ?? "Clear",
  });
}

export const fetchWeather = tool(
  async ({ city }) => fetchLiveWeather(city),
  {
    name: "fetchWeather",
    description: "Fetch real-time weather data for a city. Always call this — never guess weather.",
    schema: z.object({
      city: z.string().describe("City name in English, e.g. Cairo, Paris, Moscow")
    })
  }
);

export const setLocation = tool(
  async ({ city }) => {
    setUserLocation(city);
    return `Location saved: ${city}`;
  },
  {
    name: "setLocation",
    description: "Save or update the user's primary city in memory.",
    schema: z.object({
      city: z.string().describe("City name in English")
    })
  }
);

export const tools = [fetchWeather, setLocation];
