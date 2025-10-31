import React, { useMemo, useRef, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getWeatherEmoji } from "../../lib/weatherHelpers";

interface HourlyWeatherData {
  time: string;
  tempC: number;
  rainChance: number;
  weatherCode?: number;
}

interface WeatherCarouselProps {
  hours: HourlyWeatherData[];
  currentHourIndex?: number;
  visibleCount?: number;
}

export function WeatherCarousel({
  hours,
  currentHourIndex,
}: WeatherCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  
  // Figure out the starting index ("now")
  const startIndex = useMemo(() => {
    if (typeof currentHourIndex === "number") return currentHourIndex;
    
    const now = new Date();
    const curHourStr = now.getHours().toString().padStart(2, "0") + ":00";
    
    let idx = hours.findIndex(h => h.time === curHourStr);
    
    if (idx === -1) {
      idx = hours.findIndex(h => {
        const [HH] = h.time.split(":").map(n => parseInt(n, 10));
        return HH >= now.getHours();
      });
    }
    
    if (idx === -1) idx = 0;
    return idx;
  }, [hours, currentHourIndex]);

  // Only consider future hours from startIndex forward
  const futureHours = useMemo(() => {
    return hours.slice(startIndex);
  }, [hours, startIndex]);

  // Check scroll position to enable/disable arrows
  const checkScrollPosition = () => {
    if (!scrollContainerRef.current) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1); // -1 for rounding
  };

  useEffect(() => {
    checkScrollPosition();
    
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScrollPosition);
      return () => container.removeEventListener('scroll', checkScrollPosition);
    }
  }, [futureHours]);

  if (futureHours.length === 0) {
    return null; // No hours to show
  }

  // Scroll functions
  const scrollLeft = () => {
    if (scrollContainerRef.current && canScrollLeft) {
      scrollContainerRef.current.scrollBy({ left: -120, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current && canScrollRight) {
      scrollContainerRef.current.scrollBy({ left: 120, behavior: 'smooth' });
    }
  };

  // Touch handling for swipe
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const swipeDistance = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;

    if (Math.abs(swipeDistance) > minSwipeDistance) {
      if (swipeDistance > 0) {
        scrollRight();
      } else {
        scrollLeft();
      }
    }

    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  return (
    <div className="w-full max-w-[340px] rounded-xl border border-gray-200 bg-white px-2 py-2 shadow-sm flex items-center gap-2">
      {/* LEFT ARROW */}
      <button
        onClick={scrollLeft}
        disabled={!canScrollLeft}
        className={`p-1 rounded-lg border border-gray-200 flex-shrink-0 transition-all ${
          canScrollLeft 
            ? 'text-gray-500 hover:bg-gray-50 cursor-pointer' 
            : 'text-gray-300 cursor-not-allowed'
        }`}
        style={{ lineHeight: 0 }}
        aria-label="previous hours"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* HOURS SCROLLABLE CONTAINER */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-x-scroll snap-x snap-mandatory"
        style={{ 
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
          scrollBehavior: 'smooth'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex gap-2" style={{ paddingLeft: '2px', paddingRight: '2px' }}>
          {futureHours.map((h, idx) => {
            const icon = getWeatherEmoji(h.weatherCode ?? null, h.rainChance);
            
            return (
              <div
                key={h.time + idx}
                className="flex flex-col items-center flex-shrink-0 bg-gray-50 rounded-md py-1 px-2 snap-start"
                style={{ minWidth: '70px', fontSize: '10px' }}
              >
                {/* time · temp */}
                <div className="flex items-center gap-1 whitespace-nowrap">
                  <span className="font-semibold text-gray-900">{h.time}</span>
                  <span className="text-gray-400">·</span>
                  <span className="font-semibold text-gray-900">{h.tempC}°</span>
                </div>
                
                {/* icon + rainChance */}
                <div className="flex items-center gap-1 text-[9px] text-gray-500 mt-0.5">
                  <span className="leading-none text-sm">{icon}</span>
                  <span
                    className={
                      h.rainChance >= 50
                        ? "text-rose-500 font-semibold"
                        : "text-gray-600 font-semibold"
                    }
                  >
                    {h.rainChance}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT ARROW */}
      <button
        onClick={scrollRight}
        disabled={!canScrollRight}
        className={`p-1 rounded-lg border border-gray-200 flex-shrink-0 transition-all ${
          canScrollRight 
            ? 'text-gray-500 hover:bg-gray-50 cursor-pointer' 
            : 'text-gray-300 cursor-not-allowed'
        }`}
        style={{ lineHeight: 0 }}
        aria-label="next hours"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
