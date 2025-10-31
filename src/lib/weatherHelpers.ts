// Weather helper utilities for icons and tips

import { 
  Umbrella, 
  Sun, 
  Droplets, 
  Wind,
  ThermometerSun,
  Shirt,
  ShieldCheck,
  Glasses
} from 'lucide-react';

/**
 * Map Open-Meteo weather codes to emoji icons
 * Reference: https://open-meteo.com/en/docs
 */
export function getWeatherEmoji(weatherCode: number | null, rainChance: number): string {
  if (weatherCode === null) {
    return rainChance > 50 ? '🌧' : '🌤';
  }

  // Clear sky
  if (weatherCode === 0) return '☀️';
  
  // Mainly clear, partly cloudy, and overcast
  if (weatherCode === 1) return '🌤';
  if (weatherCode === 2) return '⛅';
  if (weatherCode === 3) return '☁️';
  
  // Fog
  if (weatherCode >= 45 && weatherCode <= 48) return '🌫';
  
  // Drizzle
  if (weatherCode >= 51 && weatherCode <= 57) return '🌦';
  
  // Rain
  if (weatherCode >= 61 && weatherCode <= 67) return '🌧';
  if (weatherCode >= 80 && weatherCode <= 82) return '🌧';
  
  // Snow
  if (weatherCode >= 71 && weatherCode <= 77) return '❄️';
  if (weatherCode >= 85 && weatherCode <= 86) return '❄️';
  
  // Thunderstorm
  if (weatherCode >= 95 && weatherCode <= 99) return '⛈';
  
  // Default fallback based on rain chance
  return rainChance > 50 ? '🌧' : '🌤';
}

export interface WeatherTip {
  icon: any; // Lucide icon component
  label: string;
  priority: number; // Higher = more important
}

/**
 * Generate weather tips based on conditions
 * Returns tips with Lucide React icons
 */
export function getWeatherTips(
  tempMax: number | null,
  tempMin: number | null,
  rainChance: number | null,
  windSpeed: number | null
): WeatherTip[] {
  const tips: WeatherTip[] = [];

  // Rain protection
  if (rainChance !== null && rainChance >= 40) {
    tips.push({
      icon: Umbrella,
      label: 'Umbrella',
      priority: rainChance >= 70 ? 10 : 7
    });
  }

  // Heat protection
  if (tempMax !== null) {
    if (tempMax >= 28) {
      tips.push({
        icon: Droplets,
        label: 'Water bottle',
        priority: tempMax >= 32 ? 9 : 6
      });
      tips.push({
        icon: ThermometerSun,
        label: 'Sunscreen',
        priority: 8
      });
      tips.push({
        icon: Glasses,
        label: 'Hat & sunglasses',
        priority: 5
      });
    } else if (tempMax >= 25) {
      tips.push({
        icon: ThermometerSun,
        label: 'Sunscreen',
        priority: 6
      });
      tips.push({
        icon: Glasses,
        label: 'Hat & sunglasses',
        priority: 4
      });
    }
  }

  // Cold protection - more accurate recommendations
  if (tempMax !== null && tempMin !== null) {
    const avgTemp = (tempMax + tempMin) / 2;
    
    if (avgTemp <= 5) {
      tips.push({
        icon: Shirt,
        label: 'Heavy winter coat & layers',
        priority: 9
      });
    } else if (tempMax <= 10) {
      tips.push({
        icon: Shirt,
        label: 'Warm jacket & scarf',
        priority: 8
      });
    } else if (tempMax <= 15) {
      tips.push({
        icon: Shirt,
        label: 'Light jacket',
        priority: 5
      });
    } else if (tempMax <= 20 && tempMin <= 12) {
      // Cool morning/evening
      tips.push({
        icon: Shirt,
        label: 'Light jacket for evening',
        priority: 4
      });
    }
  }

  // Wind protection
  if (windSpeed !== null && windSpeed >= 30) {
    tips.push({
      icon: Wind,
      label: 'Windbreaker',
      priority: 6
    });
  }

  // Sort by priority (highest first) and take top 3
  tips.sort((a, b) => b.priority - a.priority);
  return tips.slice(0, 3);
}

/**
 * Get a one-line weather summary
 */
export function getWeatherSummary(
  tempMin: number | null,
  tempMax: number | null,
  rainChance: number | null,
  windSpeed: number | null
): { condition: string; emoji: string } {
  let condition = 'Pleasant';
  let emoji = '🌤';

  if (rainChance !== null && rainChance > 70) {
    condition = 'Rainy';
    emoji = '🌧';
  } else if (rainChance !== null && rainChance > 40) {
    condition = 'Partly Cloudy';
    emoji = '⛅';
  } else if (tempMax !== null && tempMax > 30) {
    condition = 'Hot & Sunny';
    emoji = '☀️';
  } else if (tempMax !== null && tempMax > 25) {
    condition = 'Sunny';
    emoji = '☀️';
  } else if (tempMax !== null && tempMax < 10) {
    condition = 'Cold';
    emoji = '🥶';
  }

  return { condition, emoji };
}

