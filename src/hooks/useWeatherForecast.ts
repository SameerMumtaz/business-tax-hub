import { useQuery } from "@tanstack/react-query";

export interface DailyWeather {
  date: string;
  weatherCode: number;
  precipitationMm: number;
  label: string;
  icon: string;
  isRainDay: boolean;
  isStormDay: boolean;
}

const WEATHER_INFO: Record<number, { label: string; icon: string }> = {
  0: { label: "Clear sky", icon: "☀️" },
  1: { label: "Mainly clear", icon: "🌤️" },
  2: { label: "Partly cloudy", icon: "⛅" },
  3: { label: "Overcast", icon: "☁️" },
  45: { label: "Fog", icon: "🌫️" },
  48: { label: "Rime fog", icon: "🌫️" },
  51: { label: "Light drizzle", icon: "🌦️" },
  53: { label: "Moderate drizzle", icon: "🌧️" },
  55: { label: "Dense drizzle", icon: "🌧️" },
  61: { label: "Slight rain", icon: "🌦️" },
  63: { label: "Moderate rain", icon: "🌧️" },
  65: { label: "Heavy rain", icon: "🌧️" },
  71: { label: "Slight snow", icon: "🌨️" },
  73: { label: "Moderate snow", icon: "❄️" },
  75: { label: "Heavy snow", icon: "❄️" },
  77: { label: "Snow grains", icon: "❄️" },
  80: { label: "Slight showers", icon: "🌦️" },
  81: { label: "Moderate showers", icon: "🌧️" },
  82: { label: "Violent showers", icon: "⛈️" },
  85: { label: "Slight snow showers", icon: "🌨️" },
  86: { label: "Heavy snow showers", icon: "❄️" },
  95: { label: "Thunderstorm", icon: "⛈️" },
  96: { label: "Thunderstorm + hail", icon: "⛈️" },
  99: { label: "Severe thunderstorm", icon: "⛈️" },
};

const RAIN_CODES = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82]);
const STORM_CODES = new Set([82, 95, 96, 99]);
const HEAVY_PRECIP_MM = 5;

export function useWeatherForecast(lat?: number | null, lng?: number | null) {
  return useQuery({
    queryKey: ["weather-forecast", lat?.toFixed(2), lng?.toFixed(2)],
    queryFn: async (): Promise<Map<string, DailyWeather>> => {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,precipitation_sum&timezone=auto&forecast_days=14`
      );
      if (!res.ok) return new Map();
      const data = await res.json();
      const map = new Map<string, DailyWeather>();
      const dates: string[] = data.daily?.time || [];
      const codes: number[] = data.daily?.weathercode || [];
      const precip: number[] = data.daily?.precipitation_sum || [];
      dates.forEach((date, i) => {
        const info = WEATHER_INFO[codes[i]] || { label: "Unknown", icon: "" };
        map.set(date, {
          date,
          weatherCode: codes[i],
          precipitationMm: precip[i] || 0,
          ...info,
          isRainDay: RAIN_CODES.has(codes[i]) || (precip[i] || 0) > HEAVY_PRECIP_MM,
          isStormDay: STORM_CODES.has(codes[i]),
        });
      });
      return map;
    },
    enabled: !!lat && !!lng,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
