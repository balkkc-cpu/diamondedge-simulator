import { env, isWeatherConfigured } from "@/lib/env";
import { Weather } from "@/types/models";
import { Coordinate } from "./location";

/**
 * Fetch current conditions for a coordinate.
 *
 * REAL WEATHER: when `EXPO_PUBLIC_WEATHER_API_KEY` is set, replace the mock
 * branch below with a real call (e.g. OpenWeather One Call) and map the
 * response into the `Weather` shape. The rest of the app is agnostic to source.
 */
export async function getWeather(coord: Coordinate): Promise<Weather> {
  if (isWeatherConfigured) {
    try {
      // Example real integration (left as a placeholder so the build never
      // depends on a live key):
      //
      // const url = `https://api.openweathermap.org/data/2.5/weather?lat=${coord.latitude}&lon=${coord.longitude}&units=imperial&appid=${env.weatherApiKey}`;
      // const res = await fetch(url);
      // const json = await res.json();
      // return {
      //   temperatureF: Math.round(json.main.temp),
      //   windSpeedMph: Math.round(json.wind.speed),
      //   windDirectionDeg: json.wind.deg,
      //   humidityPct: json.main.humidity,
      //   isMock: false,
      // };
      void env.weatherApiKey;
    } catch {
      // fall through to mock
    }
  }

  // Deterministic-ish mock so the UI has believable, stable conditions.
  const seed = Math.abs(Math.round((coord.latitude + coord.longitude) * 10)) % 5;
  const mocks: Weather[] = [
    { temperatureF: 72, windSpeedMph: 8, windDirectionDeg: 135, humidityPct: 55, isMock: true },
    { temperatureF: 64, windSpeedMph: 14, windDirectionDeg: 315, humidityPct: 68, isMock: true },
    { temperatureF: 81, windSpeedMph: 5, windDirectionDeg: 90, humidityPct: 40, isMock: true },
    { temperatureF: 58, windSpeedMph: 18, windDirectionDeg: 200, humidityPct: 72, isMock: true },
    { temperatureF: 76, windSpeedMph: 10, windDirectionDeg: 45, humidityPct: 50, isMock: true },
  ];
  return mocks[seed];
}

/**
 * Translate a wind direction (degrees, blowing TOWARD) relative to the shot
 * heading (north / toward the green) into a human label and a yardage delta.
 * Positive delta => plays longer (into wind); negative => plays shorter.
 */
export function windEffect(weather: Weather | undefined, targetYards: number): {
  label: string;
  yardsDelta: number;
} {
  if (!weather) return { label: "no wind data", yardsDelta: 0 };
  // Shot heads "up" the canvas (toward 0deg). Component along the shot line:
  const rad = (weather.windDirectionDeg * Math.PI) / 180;
  const along = Math.cos(rad); // +1 = tailwind, -1 = headwind
  const cross = Math.sin(rad);

  const factor = (targetYards / 150) * weather.windSpeedMph * 0.9;
  const yardsDelta = Math.round(-along * factor); // headwind -> plays longer

  let label: string;
  if (Math.abs(along) > Math.abs(cross)) {
    label = along < 0 ? "into wind" : "downwind";
  } else {
    label = cross > 0 ? "left-to-right wind" : "right-to-left wind";
  }
  return { label, yardsDelta };
}
