import React, { useMemo, useState } from 'react';
import type { Activity, Context } from '../../lib/schema';
import CacheIndicator from '../components/CacheIndicator';
import { getImageUrl } from '../../config/assets';

interface ResultsPageProps {
  searchResults: {
    activities: Activity[] | null;
    ctx: Context | null;
    webSources: Array<{title: string; url: string; source: string}> | null;
    cacheInfo?: {
      isCached: boolean;
      cacheType: 'exact' | 'similar';
      similarity: number;
      originalSearch: {
        location: string;
        date: string;
        searchKey: string;
      };
    };
    aiModel?: string;
  };
  searchParams: {
    location: string;
    date: string;
    duration: number | '';
    ages: number[];
    extraInstructions: string;
  };
  loading: {
    isLoading: boolean;
    progress: number;
    status: string;
  };
  exclusionList: {[location: string]: string[]};
  addToExclusionList: (location: string, attraction: string) => Promise<boolean>;
  removeFromExclusionList: (location: string, attraction: string) => Promise<boolean>;
  backToSearch: () => void;
  onRefreshSearch?: () => void;
}

function getCategoryIcon(category: string): string {
  switch(category) {
    case 'playground': return '🏞️';
    case 'park': return '🌳';
    case 'museum': return '🏛️';
    case 'outdoor': return '🌤️';
    case 'indoor': return '🏠';
    case 'water': return '💧';
    case 'hike': return '🥾';
    case 'creative': return '🎨';
    case 'festival': return '🎪';
    case 'show': return '🎭';
    case 'seasonal': return '🌟';
    default: return '📍';
  }
}

function getFreeIcon(free: boolean | undefined): React.ReactNode {
  if (free === true) return <span className="text-green-600">💚</span>;
  if (free === false) return <span className="text-amber-600">💰</span>;
  return null;
}

function getWeatherIcon(weather: string): string {
  switch(weather) {
    case 'good': return '☀️';
    case 'ok': return '⛅';
    case 'bad': return '🌧️';
    default: return '🌤️';
  }
}

function getDetailedWeatherIcon(temp: number | null, precipitation: number | null): string {
  if (precipitation !== null && precipitation > 70) return '🌧️';
  if (precipitation !== null && precipitation > 40) return '⛅';
  if (temp !== null && temp > 25) return '☀️';
  if (temp !== null && temp < 10) return '❄️';
  return '🌤️';
}

function Chip({ children }: { children: React.ReactNode }) { 
  return <span className="chip">{children}</span>; 
}

function LoadingSkeleton() {
  return (
    <section className="card p-5 md:p-6 bg-white/95 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="h-6 bg-gray-200 rounded w-32 animate-pulse"></div>
        <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="p-5 rounded-2xl border border-gray-200 bg-white animate-pulse">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-8 h-8 bg-gray-200 rounded-full flex-shrink-0"></div>
              <div className="flex-1">
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
            <div className="flex gap-1 mb-3">
              <div className="h-6 bg-gray-200 rounded-full w-16"></div>
              <div className="h-6 bg-gray-200 rounded-full w-12"></div>
            </div>
            <div className="space-y-2">
              <div className="h-3 bg-gray-200 rounded w-full"></div>
              <div className="h-3 bg-gray-200 rounded w-4/5"></div>
              <div className="h-3 bg-gray-200 rounded w-3/5"></div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ResultsPage({
  searchResults,
  searchParams,
  loading,
  exclusionList,
  addToExclusionList,
  removeFromExclusionList,
  backToSearch,
  onRefreshSearch
}: ResultsPageProps) {
  const [fCat, setFCat] = useState<string>('');
  const [fFree, setFFree] = useState<string>('');
  const [fWeather, setFWeather] = useState<string>('');
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [prompt, setPrompt] = useState<string>('');
  const [showExclusionManager, setShowExclusionManager] = useState<boolean>(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied'>('idle');

  const { activities, ctx, webSources, cacheInfo, aiModel } = searchResults;

  const cats = useMemo(() => 
    Array.from(new Set((activities || []).map(a => a.category))).sort(), 
    [activities]
  );

  const filtered = useMemo(() => {
    let list = (activities || []).slice();
    if (fCat) list = list.filter(a => a.category === fCat);
    if (fFree === 'true') list = list.filter(a => a.free === true);
    if (fFree === 'false') list = list.filter(a => a.free === false);
    if (fWeather) list = list.filter(a => a.weather_fit === fWeather);
    return list;
  }, [activities, fCat, fFree, fWeather]);

  const fetchPrompt = async (context: Context) => {
    try {
      const resp = await fetch('/api/prompt', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          ctx: context, 
          allowedCategories: 'outdoor|indoor|museum|park|playground|water|hike|creative|festival|show|seasonal|other',
          extraInstructions: searchParams.extraInstructions 
        }) 
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data: { ok: boolean; prompt: string } = await resp.json();
      setPrompt(data.prompt);
    } catch (err: any) {
      console.error('Failed to fetch prompt:', err);
      setPrompt('Error fetching prompt: ' + err.message);
    }
  };

  return (
    <div 
      className="min-h-screen bg-cover bg-center bg-fixed"
      style={{ backgroundImage: `url(${getImageUrl('BG6')})` }}
    >
      {/* Header */}
      <div className="bg-white/95 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-40 px-4 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={backToSearch}
            className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Search
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900">Activity Results</h1>
              <CacheIndicator cacheInfo={cacheInfo} currentSearch={{ location: searchParams.location, date: searchParams.date }} onRefreshSearch={onRefreshSearch} />
              {aiModel && (
                <span className="text-xs text-gray-500">Model: {aiModel}</span>
              )}
              </div>
              {ctx && (
              <p className="text-sm text-gray-600">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ctx.location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {ctx.location}
                </a>{' '}
                • {new Date(ctx.date).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
        
        {/* Quick Navigation */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
          <button 
            onClick={() => {
              const element = document.getElementById('search-context');
              if (element) {
                // Dynamically calculate header height for more accurate positioning
                const header = document.querySelector('header') || document.querySelector('.sticky');
                const headerHeight = header ? header.getBoundingClientRect().height + 20 : 140; // 20px extra padding
                const elementPosition = element.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerHeight;
                window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
              }
            }}
            className="flex items-center gap-1 px-3 py-1 text-xs bg-white/80 hover:bg-white border border-gray-200 rounded-full whitespace-nowrap"
          >
            <span>📋</span>
            Context
          </button>
          {activities && activities.length > 0 && (
            <button 
              onClick={() => {
                const element = document.getElementById('activities');
                if (element) {
                  // Dynamically calculate header height for more accurate positioning
                  const header = document.querySelector('header') || document.querySelector('.sticky');
                  const headerHeight = header ? header.getBoundingClientRect().height + 20 : 140; // 20px extra padding
                  const elementPosition = element.getBoundingClientRect().top;
                  const offsetPosition = elementPosition + window.pageYOffset - headerHeight;
                  window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
                }
              }}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-white/80 hover:bg-white border border-gray-200 rounded-full whitespace-nowrap"
            >
              <span>🎯</span>
              Activities ({activities.length})
            </button>
          )}
          {webSources && webSources.length > 0 && (
            <button 
              onClick={() => {
                const element = document.getElementById('web-sources');
                if (element) {
                  // Dynamically calculate header height for more accurate positioning
                  const header = document.querySelector('header') || document.querySelector('.sticky');
                  const headerHeight = header ? header.getBoundingClientRect().height + 20 : 140; // 20px extra padding
                  const elementPosition = element.getBoundingClientRect().top;
                  const offsetPosition = elementPosition + window.pageYOffset - headerHeight;
                  window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
                }
              }}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-white/80 hover:bg-white border border-gray-200 rounded-full whitespace-nowrap"
            >
              <span>🌐</span>
              Web Sources
            </button>
          )}
          {showPrompt && prompt && (
            <button 
              onClick={() => {
                const element = document.getElementById('ai-prompt');
                if (element) {
                  const headerHeight = 120;
                  const elementPosition = element.getBoundingClientRect().top;
                  const offsetPosition = elementPosition + window.pageYOffset - headerHeight;
                  window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
                }
              }}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-white/80 hover:bg-white border border-gray-200 rounded-full whitespace-nowrap"
            >
              <span>🤖</span>
              AI Prompt
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6 pb-32">
        {/* Search Context */}
        {ctx && (
          <section id="search-context" className="card p-5 md:p-6 bg-white/95 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Search Context</h2>
              <div className="flex items-center gap-3">
                {!loading.isLoading && (
                  <button 
                    className="btn btn-secondary text-xs" 
                    onClick={() => {
                      setShowPrompt(!showPrompt);
                      if (!showPrompt && !prompt) {
                        fetchPrompt(ctx);
                      }
                    }}
                  >
                    {showPrompt ? '🔍 Hide Prompt' : '🔍 View AI Prompt'}
                  </button>
                )}
                <div className="text-sm text-gray-500">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ctx.location)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {ctx.location}
                  </a>
                </div>
              </div>
            </div>
            
            {/* Extra Instructions */}
            {searchParams.extraInstructions && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg instructions-context-mobile">
                <div className="flex items-center gap-2 mb-1">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-yellow-600 flex-shrink-0">
                    <path d="M14.828 2.828a4 4 0 015.657 0L22 4.343a4 4 0 010 5.657L20.828 11.172 7.172 24.828 1 23l1.828-6.172L16.586 3.414zm0 0L17.657 6.171" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-sm font-medium text-yellow-800">Special Instructions</span>
                </div>
                <p className="text-sm text-yellow-700 break-words">{searchParams.extraInstructions}</p>
              </div>
            )}
            
            {/* Compact Context Grid */}
            <div className="space-y-4">
              {/* Weather Card */}
              <div className={`p-4 rounded-xl border border-gray-200 text-white relative overflow-hidden ${
                ctx.weather.temperature_max_c === null && ctx.weather.precipitation_probability_percent === null
                  ? 'bg-gradient-to-br from-gray-500 via-gray-600 to-gray-700'
                  : 'bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700'
              }`}>
                <div className="absolute top-2 right-2 text-xs opacity-75">
                  {new Date(ctx.date).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">
                      {ctx.weather.temperature_max_c === null && ctx.weather.precipitation_probability_percent === null
                        ? '🌫️' 
                        : getDetailedWeatherIcon(ctx.weather.temperature_max_c, ctx.weather.precipitation_probability_percent)
                      }
                    </div>
                    <div>
                      <div className="text-xl font-bold">
                        {ctx.weather.temperature_max_c ?? '—'}°
                      </div>
                      <div className="text-xs opacity-80">
                        {ctx.weather.temperature_max_c === null && ctx.weather.temperature_min_c === null
                          ? 'Weather data unavailable'
                          : `${ctx.weather.temperature_min_c ?? '—'}°~${ctx.weather.temperature_max_c ?? '—'}°`
                        }
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <span>💧</span>
                      <span>{ctx.weather.precipitation_probability_percent ?? '—'}%</span>
                    </div>
                    {typeof ctx.weather.wind_speed_max_kmh === 'number' && (
                      <div className="flex items-center gap-1">
                        <span>💨</span>
                        <span>{Math.round(ctx.weather.wind_speed_max_kmh)}km/h</span>
                      </div>
                    )}
                  </div>
                </div>
                {ctx.weather.temperature_max_c === null && ctx.weather.precipitation_probability_percent === null && (
                  <div className="mt-2 text-xs opacity-80">
                    Weather forecast unavailable for future dates
                  </div>
                )}
              </div>

              {/* Compact Status Row */}
              <div className="flex gap-3 text-sm">
                {/* Holiday Status */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200">
                  <span className="text-lg">{ctx.is_public_holiday ? '🎉' : '📅'}</span>
                  <span className="text-gray-700">
                    {ctx.is_public_holiday 
                      ? (ctx.holidays && ctx.holidays.length > 0 
                          ? `${ctx.holidays.length} holiday${ctx.holidays.length > 1 ? 's' : ''}`
                          : 'Public holiday')
                      : 'No public holiday'}
                  </span>
                </div>

                {/* Festival Status */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200">
                  <span className="text-lg">🎪</span>
                  <span className="text-gray-700">
                    {ctx.nearby_festivals.length > 0 
                      ? `${ctx.nearby_festivals.length} festival${ctx.nearby_festivals.length > 1 ? 's' : ''} nearby`
                      : 'No festivals nearby'
                    }
                  </span>
                </div>
              </div>

              {/* Holidays Detail (only if there are holidays) */}
              {ctx.holidays && ctx.holidays.length > 0 && (
                <div className="space-y-2">
                  {ctx.holidays.map((holiday, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                      <span className="text-lg">🎉</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-yellow-900 truncate">{holiday.localName}</div>
                        {holiday.localName !== holiday.name && (
                          <div className="text-xs text-yellow-700 truncate">{holiday.name}</div>
                        )}
                        <div className="text-xs text-yellow-600">
                          {new Date(holiday.date).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Festivals Detail (only if there are festivals) */}
              {ctx.nearby_festivals.length > 0 && (
                <div className="space-y-2">
                  {ctx.nearby_festivals.slice(0, 2).map((f, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-white border border-gray-200">
                      <span className="text-lg">🎪</span>
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
                  {ctx.nearby_festivals.length > 2 && (
                    <div className="text-center text-xs text-purple-600 font-medium">
                      +{ctx.nearby_festivals.length - 2} more festivals
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* AI Prompt */}
        {showPrompt && prompt && !loading.isLoading && (
          <section id="ai-prompt" className="card p-5 md:p-6 bg-white/95 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">AI Prompt</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    try {
                      setCopyStatus('copying');
                      await navigator.clipboard.writeText(prompt);
                      setCopyStatus('copied');
                      setTimeout(() => {
                        setCopyStatus('idle');
                      }, 2000);
                    } catch (err) {
                      console.error('Failed to copy:', err);
                      setCopyStatus('idle');
                    }
                  }}
                  disabled={copyStatus === 'copying'}
                  className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 rounded-full transition-colors disabled:opacity-50"
                >
                  {copyStatus === 'copied' ? '✓ Copied' : copyStatus === 'copying' ? '⏳ Copying...' : '📋 Copy'}
                </button>
                <span className="text-xs text-gray-500">Tap prompt to copy</span>
              </div>
            </div>
            <div 
              className={`rounded-xl p-4 overflow-auto cursor-pointer transition-colors ${
                copyStatus === 'copied' ? 'bg-green-50' : 'bg-gray-50 hover:bg-gray-100'
              }`}
              onClick={async () => {
                try {
                  setCopyStatus('copying');
                  await navigator.clipboard.writeText(prompt);
                  setCopyStatus('copied');
                  setTimeout(() => {
                    setCopyStatus('idle');
                  }, 1000);
                } catch (err) {
                  console.error('Failed to copy:', err);
                  setCopyStatus('idle');
                }
              }}
            >
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">{prompt}</pre>
            </div>
          </section>
        )}

        {/* Loading Skeleton */}
        {loading.isLoading && loading.progress >= 70 && (
          <LoadingSkeleton />
        )}

        {/* Activities */}
        {activities && !loading.isLoading && (
          <section id="activities" className="card p-5 md:p-6 bg-white/95 backdrop-blur-sm relative">
            {/* Results count badge */}
            <div className="absolute top-3 right-3 bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full text-xs font-medium">
              {filtered.length}
            </div>
            
            <div className="flex flex-col gap-4 mb-4">
              <h2 className="text-lg font-semibold">Activities</h2>
              
              {/* Improved Filters */}
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-600">🏷️</span>
                  <select className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" value={fCat} onChange={e => setFCat(e.target.value)}>
                    <option value="">All Categories</option>
                    {cats.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-600">💰</span>
                  <select className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" value={fFree} onChange={e => setFFree(e.target.value)}>
                    <option value="">Free & Paid</option>
                    <option value="true">Free Only</option>
                    <option value="false">Paid Only</option>
                  </select>
                </div>
                
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-600">🌤️</span>
                  <select className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" value={fWeather} onChange={e => setFWeather(e.target.value)}>
                    <option value="">Any Weather</option>
                    <option value="good">Good Weather</option>
                    <option value="ok">OK Weather</option>
                    <option value="bad">Bad Weather</option>
                  </select>
                </div>
                
                {/* Clear filters button */}
                {(fCat || fFree || fWeather) && (
                  <button
                    onClick={() => {
                      setFCat('');
                      setFFree('');
                      setFWeather('');
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-800 underline ml-2"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((a, idx) => (
                <article key={idx} className="relative rounded-2xl bg-gradient-border p-[2px] hover:shadow-lg transition-all duration-200">
                  <div className="bg-white rounded-2xl p-5 h-full relative">
                    {/* Exclude button */}
                    <button
                      onClick={async () => {
                        if (ctx && await addToExclusionList(ctx.location, a.title || 'Untitled activity')) {
                          // Activity will be removed from results in parent component
                        }
                      }}
                      className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1 rounded-full transition-colors flex items-center gap-1 opacity-80 hover:opacity-100"
                      title="Don't suggest this attraction again for this location"
                    >
                      🚫
                    </button>

                    <div className="flex items-start gap-3 mb-3">
                      <div className="text-2xl flex-shrink-0 mt-1">{getCategoryIcon(a.category)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 pr-8">
                          <h3 className="font-semibold text-gray-900 text-base leading-tight">{a.title || 'Untitled activity'}</h3>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {getFreeIcon(a.free)}
                            <span className="text-lg">{getWeatherIcon(a.weather_fit)}</span>
                          </div>
                        </div>
                        {a.address && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[13px] text-gray-600 mt-1 flex items-center gap-1 hover:underline"
                          >
                            <span>📍</span>{a.address}
                          </a>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-1 mb-3">
                      {a.category && <Chip>{getCategoryIcon(a.category)} {a.category}</Chip>}
                      {a.free != null && <Chip>{getFreeIcon(a.free)} {a.free ? 'Free' : 'Paid'}</Chip>}
                      {typeof a.duration_hours === 'number' && <Chip>⏱️ {a.duration_hours}h</Chip>}
                      {a.suitable_ages && <Chip>👶 {a.suitable_ages}</Chip>}
                    </div>
                    
                    <p className="text-sm text-gray-700 leading-relaxed">{a.description || ''}</p>
                    {a.notes && (
                      <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                        <div className="text-[13px] text-amber-800 flex items-start gap-2">
                          <span className="text-amber-600 flex-shrink-0">⚠️</span>
                          <span>{a.notes}</span>
                        </div>
                      </div>
                    )}
                    
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {a.booking_url && (
                          <a className="text-sm text-indigo-600 hover:text-indigo-700 hover:underline font-medium flex items-center gap-1" href={a.booking_url} target="_blank">
                            🔗 Book/Info
                          </a>
                        )}
                      </div>
                      {Array.isArray(a.evidence) && a.evidence.length > 0 && (
                        <div className="text-[11px] text-gray-500">
                          <span>Sources: </span>
                          {a.evidence.map((u, i) => (
                            <a key={i} className="text-indigo-500 hover:underline ml-1" href={u} target="_blank">
                              [{i + 1}]
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {filtered.length === 0 && activities && activities.length > 0 && (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-4">🔍</div>
                <p>No activities match your current filters.</p>
                <button 
                  onClick={() => {
                    setFCat('');
                    setFFree('');
                    setFWeather('');
                  }}
                  className="mt-2 text-indigo-600 hover:text-indigo-800 underline text-sm"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </section>
        )}

        {/* Web Sources */}
        {webSources && webSources.length > 0 && !loading.isLoading && (
          <section id="web-sources" className="card p-5 md:p-6 bg-white/95 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">🌐</span>
                <h2 className="text-lg font-semibold">Enhanced with Current Web Intelligence</h2>
                <div className="flex items-center gap-1 bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 px-2 py-1 rounded-full text-xs font-medium border border-green-200">
                  <span>⚡</span>
                  <span>Live Data</span>
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-600 mb-4">
              These activity recommendations were enhanced using current information from trusted travel sources and event platforms:
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {webSources.map((source, idx) => {
                const isEventSource = source.source.toLowerCase().includes('event') || 
                                     source.source.toLowerCase().includes('tourism') || 
                                     source.source.toLowerCase().includes('intelligence');
                return (
                  <div key={idx} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    isEventSource 
                      ? 'border-purple-200 bg-purple-50 hover:bg-purple-100' 
                      : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                  }`}>
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      isEventSource 
                        ? 'bg-purple-100' 
                        : 'bg-indigo-100'
                    }`}>
                      {isEventSource ? (
                        <span className="text-purple-600 text-sm">🎪</span>
                      ) : (
                        <span className={`${isEventSource ? 'text-purple-600' : 'text-indigo-600'} text-xs font-bold`}>
                          {source.source.substring(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <a 
                        href={source.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={`text-sm font-medium hover:underline block truncate ${
                          isEventSource ? 'text-purple-700 hover:text-purple-900' : 'text-indigo-600 hover:text-indigo-800'
                        }`}
                      >
                        {source.title}
                      </a>
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                        {isEventSource && <span>📅</span>}
                        <span>{source.source}</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <a 
                        href={source.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={`transition-colors ${
                          isEventSource 
                            ? 'text-purple-400 hover:text-purple-600' 
                            : 'text-gray-400 hover:text-indigo-600'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Exclusion Manager Modal */}
        {showExclusionManager && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900">Manage Excluded Activities</h2>
                  <button
                    onClick={() => setShowExclusionManager(false)}
                    className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                  >
                    ×
                  </button>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Remove activities you don't want to see in future recommendations. Exclusions are saved per location.
                </p>
              </div>

              <div className="p-6">
                {Object.keys(exclusionList).length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <span className="text-4xl block mb-4">🎯</span>
                    <p>No exclusions yet!</p>
                    <p className="text-sm">Use the "Don't suggest this again" button on activities to add exclusions.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(exclusionList).map(([location, attractions]) => (
                      <div key={location} className="border border-gray-200 rounded-lg p-4">
                        <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                          <span>📍</span>
                          {location}
                          <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs">
                            {attractions.length} excluded
                          </span>
                        </h3>
                        <div className="space-y-2">
                          {attractions.map((attraction, index) => (
                            <div key={index} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg p-3">
                              <span className="text-sm text-gray-700">{attraction}</span>
                              <button
                                onClick={() => removeFromExclusionList(location, attraction)}
                                className="text-red-600 hover:text-red-800 text-sm font-medium"
                                title="Remove from exclusions"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowExclusionManager(false)}
                    className="btn btn-primary"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
