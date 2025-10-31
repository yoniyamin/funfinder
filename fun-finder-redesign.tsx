import React, { useState, useRef, useEffect } from 'react';
import { Settings, MapPin, Calendar, Users, Clock, History, X, Plus } from 'lucide-react';

export default function FunFinder() {
  const [duration, setDuration] = useState(1);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [kids, setKids] = useState([]);
  const [newKidAge, setNewKidAge] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const scrollRef = useRef(null);

  const historyItems = [
    { location: 'Central Park', date: 'Oct 20', kids: '5-8 years', duration: '2h' },
    { location: 'Museum District', date: 'Oct 15', kids: '8-12 years', duration: '3h' },
    { location: 'Beach Area', date: 'Oct 10', kids: '3-6 years', duration: '1h' },
  ];

  const durationOptions = [
    { value: 1 },
    { value: 2 },
    { value: 3 },
    { value: 4 },
    { value: 5 },
  ];

  const quickTags = [
    { 
      id: 'wheelchair', 
      label: 'Wheelchair', 
      color: 'from-blue-400 to-blue-500',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="6" r="2" fill="currentColor"/>
          <path d="M12 9c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" fill="currentColor"/>
        </svg>
      )
    },
    { 
      id: 'metro', 
      label: 'Metro', 
      color: 'from-purple-400 to-purple-500',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
          <path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4z" fill="currentColor"/>
        </svg>
      )
    },
    { 
      id: 'free', 
      label: 'Free', 
      color: 'from-green-400 to-green-500',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" fill="currentColor"/>
        </svg>
      )
    },
    { 
      id: 'indoor', 
      label: 'Indoor', 
      color: 'from-orange-400 to-orange-500',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill="currentColor"/>
        </svg>
      )
    },
    { 
      id: 'outdoor', 
      label: 'Outdoor', 
      color: 'from-teal-400 to-teal-500',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
          <path d="M14 6l-3.75 5 2.85 3.8-1.6 1.2C9.81 13.75 7 10 7 10l-6 8h22L14 6z" fill="currentColor"/>
        </svg>
      )
    },
    { 
      id: 'food', 
      label: 'Food', 
      color: 'from-red-400 to-red-500',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
          <path d="M8.1 13.34l2.83-2.83L3.91 3.5c-1.56 1.56-1.56 4.09 0 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z" fill="currentColor"/>
        </svg>
      )
    },
    { 
      id: 'parking', 
      label: 'Parking', 
      color: 'from-indigo-400 to-indigo-500',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
          <path d="M13 3H6v18h4v-6h3c3.31 0 6-2.69 6-6s-2.69-6-6-6zm.2 8H10V7h3.2c1.1 0 2 .9 2 2s-.9 2-2 2z" fill="currentColor"/>
        </svg>
      )
    },
    { 
      id: 'shade', 
      label: 'Shade', 
      color: 'from-yellow-400 to-yellow-500',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
          <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6z" fill="currentColor"/>
        </svg>
      )
    },
  ];

  const addKid = () => {
    if (newKidAge.trim()) {
      setKids([...kids, newKidAge.trim()]);
      setNewKidAge('');
    }
  };

  const removeKid = (index) => {
    setKids(kids.filter((_, i) => i !== index));
  };

  const toggleTag = (tagId) => {
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  const handleDurationClick = (value) => {
    setDuration(value);
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: (value - 1) * 40,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      if (scrollRef.current) {
        const itemHeight = 40;
        const scrollTop = scrollRef.current.scrollTop;
        const index = Math.round(scrollTop / itemHeight);
        setDuration(Math.max(1, Math.min(5, index + 1)));
      }
    };

    const scrollContainer = scrollRef.current;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
      return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-purple-900 to-slate-900 flex flex-col">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 bg-slate-900/80 backdrop-blur-md border-b border-purple-500/20 z-50 shadow-lg shadow-purple-500/10">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Fun</h1>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Finder</h1>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="p-2.5 rounded-full bg-purple-500/20 hover:bg-purple-500/30 transition-colors relative backdrop-blur-sm"
            >
              <History className="w-6 h-6 text-purple-300" />
              {historyItems.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-pink-400 rounded-full animate-pulse"></span>
              )}
            </button>
            
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2.5 rounded-full bg-blue-500/20 hover:bg-blue-500/30 transition-colors backdrop-blur-sm"
            >
              <Settings className="w-6 h-6 text-blue-300" />
            </button>
          </div>
        </div>

        {showHistory && (
          <div className="absolute top-full right-0 mt-1 w-80 bg-slate-800/95 backdrop-blur-md border border-purple-500/30 rounded-lg shadow-xl mr-4">
            <div className="p-4">
              <h3 className="font-semibold text-purple-200 mb-3">Recent Searches</h3>
              {historyItems.map((item, idx) => (
                <div key={idx} className="py-2.5 border-b border-purple-500/20 last:border-0 cursor-pointer hover:bg-purple-500/10 px-2 rounded transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-gray-200 text-sm">{item.location}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.kids} • {item.duration}</p>
                    </div>
                    <span className="text-xs text-gray-500">{item.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showSettings && (
          <div className="absolute top-full right-0 mt-1 w-72 bg-slate-800/95 backdrop-blur-md border border-blue-500/30 rounded-lg shadow-xl mr-4">
            <div className="p-4">
              <h3 className="font-semibold text-blue-200 mb-4">Settings</h3>
              <div className="space-y-2">
                <button className="w-full text-left px-3 py-2.5 hover:bg-blue-500/10 rounded-lg text-sm text-gray-300 transition-colors">
                  Exclusions
                </button>
                <button className="w-full text-left px-3 py-2.5 hover:bg-blue-500/10 rounded-lg text-sm text-gray-300 transition-colors">
                  Instructions
                </button>
                <button className="w-full text-left px-3 py-2.5 hover:bg-blue-500/10 rounded-lg text-sm text-gray-300 transition-colors">
                  Preferences
                </button>
                <button className="w-full text-left px-3 py-2.5 hover:bg-blue-500/10 rounded-lg text-sm text-gray-300 transition-colors">
                  About
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 pt-28 pb-28 px-6 overflow-y-auto">
        <div className="max-w-md mx-auto space-y-5">
          {/* Location and Date - Side by Side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-purple-200 flex items-center gap-1">
                <MapPin className="w-4 h-4 text-blue-400" />
                Location
              </label>
              <input
                type="text"
                placeholder="Enter location"
                className="w-full px-3 py-3 border border-purple-500/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-slate-800/50 backdrop-blur-sm text-gray-200 placeholder-gray-500 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-purple-200 flex items-center gap-1">
                <Calendar className="w-4 h-4 text-purple-400" />
                Date
              </label>
              <input
                type="date"
                className="w-full px-3 py-3 border border-purple-500/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent bg-slate-800/50 backdrop-blur-sm text-gray-200 text-sm"
              />
            </div>
          </div>

          {/* Kids Ages and Duration - Side by Side */}
          <div className="grid grid-cols-2 gap-3">
            {/* Kids Ages Input */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-purple-200 flex items-center gap-2">
                <Users className="w-4 h-4 text-pink-400" />
                Kids ages
              </label>
              
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g., 5 or 3-6"
                  value={newKidAge}
                  onChange={(e) => setNewKidAge(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addKid()}
                  className="w-full px-3 py-2.5 pr-10 border border-purple-500/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent bg-slate-800/50 backdrop-blur-sm text-gray-200 placeholder-gray-500 text-sm"
                />
                <button
                  onClick={addKid}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:from-pink-600 hover:to-purple-600 transition-all shadow-lg shadow-pink-500/20"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              
              {/* Added Kids Below */}
              {kids.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {kids.map((kid, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-full text-xs font-medium shadow-lg shadow-pink-500/20"
                    >
                      {kid}
                      <button
                        onClick={() => removeKid(idx)}
                        className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Duration Scroll Wheel */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-purple-200 flex items-center gap-1">
                <Clock className="w-4 h-4 text-orange-400" />
                How long?
              </label>
              <div className="relative bg-slate-800/50 backdrop-blur-sm rounded-xl border border-purple-500/30 overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-slate-800 to-transparent pointer-events-none z-10"></div>
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-slate-800 to-transparent pointer-events-none z-10"></div>
                <div className="absolute top-1/2 left-0 right-0 h-10 -mt-5 bg-gradient-to-r from-orange-500/20 to-pink-500/20 border-y-2 border-orange-500/50 pointer-events-none z-10"></div>
                
                <div 
                  ref={scrollRef}
                  className="h-28 overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  <div className="h-9"></div>
                  {durationOptions.map((option) => (
                    <div
                      key={option.value}
                      onClick={() => handleDurationClick(option.value)}
                      className={`h-10 flex items-center justify-center cursor-pointer transition-all snap-center ${
                        duration === option.value
                          ? 'text-orange-300 font-bold text-base'
                          : 'text-gray-400 text-xs'
                      }`}
                    >
                      {option.value === 5 ? '5h+' : `${option.value}h`}
                    </div>
                  ))}
                  <div className="h-9"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Features - Full Width Below */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-purple-200">
              Features <span className="text-[10px] text-gray-500">(swipe →)</span>
            </label>
            <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
              {quickTags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all transform hover:scale-105 flex-shrink-0 snap-start w-14 ${
                    selectedTags.includes(tag.id)
                      ? `bg-gradient-to-br ${tag.color} text-white shadow-lg scale-105`
                      : 'bg-slate-800/50 backdrop-blur-sm text-gray-400 border border-purple-500/20'
                  }`}
                >
                  {tag.icon}
                  <span className="text-[9px] font-medium whitespace-nowrap leading-tight">{tag.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Search Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-900 via-slate-900/95 to-transparent pointer-events-none">
        <button className="w-full max-w-md mx-auto block bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 hover:from-green-600 hover:via-emerald-600 hover:to-teal-600 text-white font-bold py-5 rounded-2xl shadow-2xl shadow-green-500/30 transition-all transform hover:scale-[1.03] active:scale-[0.98] text-xl pointer-events-auto">
          🔍 Search Activities
        </button>
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}