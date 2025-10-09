import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, MapPin, CalendarDays, Sun, Cloud, CloudRain, Snowflake, Wind, Droplets } from "lucide-react";
import type { Context } from '../../lib/schema';

interface SearchContextBarProps {
  ctx: Context;
  extraInstructions?: string;
  onShowPrompt?: () => void;
  showPromptButton?: boolean;
  defaultOpen?: boolean;
}

function getDetailedWeatherIcon(temp: number | null, precipitation: number | null): React.ReactNode {
  if (precipitation !== null && precipitation > 70) return <CloudRain size={14} className="text-blue-500" />;
  if (precipitation !== null && precipitation > 40) return <Cloud size={14} className="text-gray-500" />;
  if (temp !== null && temp > 25) return <Sun size={14} className="text-yellow-500" />;
  if (temp !== null && temp < 10) return <Snowflake size={14} className="text-blue-400" />;
  return <Sun size={14} className="text-yellow-500" />;
}

export default function SearchContextBar({
  ctx,
  extraInstructions,
  onShowPrompt,
  showPromptButton = false,
  defaultOpen = false,
}: SearchContextBarProps) {
  const [open, setOpen] = React.useState(() => {
    const saved = localStorage.getItem("ctxbar_open");
    return saved === null ? defaultOpen : saved === "1";
  });

  React.useEffect(() => {
    localStorage.setItem("ctxbar_open", open ? "1" : "0");
  }, [open]);

  const dateLabel = new Date(ctx.date).toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'numeric', 
    day: 'numeric' 
  });

  const hasHoliday = ctx.is_public_holiday && ctx.holidays && ctx.holidays.length > 0;
  const hasFestivals = ctx.nearby_festivals.length > 0;

  // Determine if weather data is available
  const hasWeather = ctx.weather.temperature_max_c !== null || ctx.weather.precipitation_probability_percent !== null;

  return (
    <div className="bg-white/95 backdrop-blur-sm border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-4">
        {/* Compact Header */}
        <div className="flex items-center justify-between gap-2 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <span className="inline-flex items-center gap-1.5 text-gray-700">
              <MapPin size={14} className="text-gray-500" />
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ctx.location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline font-medium"
              >
                {ctx.location}
              </a>
            </span>
            
            <span className="text-gray-300">•</span>
            
            <span className="inline-flex items-center gap-1.5 text-gray-700">
              <CalendarDays size={14} className="text-gray-500" />
              <span>{dateLabel}</span>
            </span>
            
            {hasWeather && (
              <>
                <span className="text-gray-300">•</span>
                <span className="inline-flex items-center gap-1.5 text-gray-700">
                  {getDetailedWeatherIcon(ctx.weather.temperature_max_c, ctx.weather.precipitation_probability_percent)}
                  <span className="font-medium">
                    {ctx.weather.temperature_max_c?.toFixed(1) ?? '—'}°C
                    {ctx.weather.temperature_min_c !== null && ctx.weather.temperature_max_c !== null
                      ? ` · ${ctx.weather.temperature_min_c.toFixed(1)}–${ctx.weather.temperature_max_c.toFixed(1)}°`
                      : ''}
                  </span>
                </span>
              </>
            )}
            
            {ctx.weather.precipitation_probability_percent !== null && (
              <>
                <span className="text-gray-300">•</span>
                <span className="inline-flex items-center gap-1.5 text-gray-600" title="Precipitation">
                  <Droplets size={14} className="text-blue-500" />
                  <span>{ctx.weather.precipitation_probability_percent}%</span>
                </span>
              </>
            )}
            
            {typeof ctx.weather.wind_speed_max_kmh === 'number' && (
              <>
                <span className="text-gray-300">•</span>
                <span className="inline-flex items-center gap-1.5 text-gray-600" title="Wind speed">
                  <Wind size={14} className="text-gray-500" />
                  <span>{Math.round(ctx.weather.wind_speed_max_kmh)} km/h</span>
                </span>
              </>
            )}
            
            {hasHoliday && (
              <>
                <span className="text-gray-300">•</span>
                <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-md text-xs font-medium">
                  🎉 {ctx.holidays!.length} holiday{ctx.holidays!.length > 1 ? 's' : ''}
                </span>
              </>
            )}
            
            {hasFestivals && (
              <>
                <span className="text-gray-300">•</span>
                <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md text-xs font-medium">
                  🎪 {ctx.nearby_festivals.length} festival{ctx.nearby_festivals.length > 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <span className="hidden sm:inline">{open ? "Hide" : "Show"}</span>
            <span className="sm:hidden text-xs">▾</span>
          </button>
        </div>

        {/* Collapsible content */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: 'hidden' }}
            >
              <div className="border-t border-gray-200 py-3 space-y-3">
                {/* Extra Instructions */}
                {extraInstructions && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-yellow-600 flex-shrink-0">
                        <path d="M14.828 2.828a4 4 0 015.657 0L22 4.343a4 4 0 010 5.657L20.828 11.172 7.172 24.828 1 23l1.828-6.172L16.586 3.414zm0 0L17.657 6.171" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span className="text-xs font-medium text-yellow-800">Special Instructions</span>
                    </div>
                    <p className="text-sm text-yellow-700 break-words">{extraInstructions}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Public Holiday */}
                  <div className={`border p-2.5 rounded-lg ${
                    hasHoliday
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-gray-200 bg-gray-50"
                  }`}>
                    <p className="text-xs text-gray-500 mb-0.5">Public Holiday</p>
                    <p className="text-sm font-semibold text-gray-800">{hasHoliday ? "Yes" : "No"}</p>
                  </div>
                  
                  {/* Festivals */}
                  <div className={`border p-2.5 rounded-lg ${
                    hasFestivals
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-gray-200 bg-gray-50"
                  }`}>
                    <p className="text-xs text-gray-500 mb-0.5">Festivals Nearby</p>
                    <p className="text-sm font-semibold text-gray-800">{hasFestivals ? "Yes" : "No"}</p>
                  </div>
                  
                  {/* Summary */}
                  <div className="border border-gray-200 bg-gray-50 p-2.5 rounded-lg">
                    <p className="text-xs text-gray-500 mb-0.5">Summary</p>
                    <p className="text-sm leading-snug text-gray-700">
                      {hasWeather ? (
                        <>
                          Expect {ctx.weather.temperature_max_c?.toFixed(0) ?? '—'}°C
                          {typeof ctx.weather.wind_speed_max_kmh === 'number' && `, ${Math.round(ctx.weather.wind_speed_max_kmh)} km/h winds`}
                          {ctx.weather.precipitation_probability_percent !== null && `, ${ctx.weather.precipitation_probability_percent}% precip.`}
                        </>
                      ) : (
                        'Weather unavailable'
                      )}
                    </p>
                  </div>
                </div>

                {/* Holidays Detail */}
                {hasHoliday && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Holiday Details</p>
                    {ctx.holidays!.map((holiday, i) => (
                      <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-yellow-50 border border-yellow-200">
                        <span className="text-base">🎉</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-yellow-900 truncate">{holiday.localName}</div>
                          {holiday.localName !== holiday.name && (
                            <div className="text-xs text-yellow-700 truncate">{holiday.name}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Festivals Detail */}
                {hasFestivals && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Festival Details</p>
                    {ctx.nearby_festivals.slice(0, 3).map((f, i) => (
                      <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-purple-50 border border-purple-200">
                        <span className="text-base">🎪</span>
                        <div className="flex-1 min-w-0">
                          {f.url ? (
                            <a className="text-sm font-medium text-purple-700 hover:text-purple-900 hover:underline block truncate" href={f.url} target="_blank">
                              {f.name}
                            </a>
                          ) : (
                            <div className="text-sm font-medium text-gray-700 truncate">{f.name}</div>
                          )}
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>{f.distance_km ?? '—'} km away</span>
                            {(f.start_date || f.end_date) && (
                              <span>• {f.start_date ?? '—'}{f.end_date ? ' → ' + f.end_date : ''}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {ctx.nearby_festivals.length > 3 && (
                      <div className="text-center text-xs text-purple-600 font-medium">
                        +{ctx.nearby_festivals.length - 3} more festivals
                      </div>
                    )}
                  </div>
                )}

                {/* Show Prompt Button */}
                {showPromptButton && onShowPrompt && (
                  <div className="pt-1">
                    <button 
                      className="px-3 py-1.5 text-sm bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg font-medium transition-colors" 
                      onClick={onShowPrompt}
                    >
                      🔍 Show AI Prompt
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

