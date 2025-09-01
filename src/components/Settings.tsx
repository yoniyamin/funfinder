import React, { useState, useEffect } from 'react';

interface ApiSettings {
  gemini_configured: boolean;
  openrouter_configured: boolean;
  google_search_configured: boolean;
  openwebninja_configured: boolean;
  ticketmaster_configured: boolean;
  ai_provider: string;
  openrouter_model: string;
  gemini_api_key_masked: string;
  openrouter_api_key_masked: string;
  google_search_api_key_masked: string;
  google_search_engine_id_masked: string;
  openwebninja_api_key_masked: string;
  ticketmaster_api_key_masked: string;
}

interface ApiTestResults {
  gemini: { configured: boolean; working: boolean; error: string | null };
  openrouter: { configured: boolean; working: boolean; error: string | null };
  google_search: { configured: boolean; working: boolean; error: string | null };
  openwebninja: { configured: boolean; working: boolean; error: string | null };
}

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Settings({ isOpen, onClose }: SettingsProps) {
  const [settings, setSettings] = useState<ApiSettings | null>(null);
  const [apiKeys, setApiKeys] = useState({
    gemini_api_key: '',
    openrouter_api_key: '',
    ai_provider: 'gemini',
    openrouter_model: 'deepseek/deepseek-chat-v3.1:free',
    google_search_api_key: '',
    google_search_engine_id: '',
    openwebninja_api_key: '',
    ticketmaster_api_key: ''
  });
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<ApiTestResults | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [activeTab, setActiveTab] = useState<'ai' | 'search'>('ai');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      if (data.ok) {
        setSettings(data.settings);
        // Update apiKeys state with loaded settings to keep radio buttons in sync
        setApiKeys(prev => ({
          ...prev,
          ai_provider: data.settings.ai_provider || 'gemini',
          openrouter_model: data.settings.openrouter_model || 'deepseek/deepseek-chat-v3.1:free'
        }));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    setMessage(null);
    
    try {
      // Only send keys that have been entered (non-empty and not in edit mode)
      const apiKeyUpdates: any = {};
      Object.keys(apiKeys).forEach(key => {
        const value = apiKeys[key as keyof typeof apiKeys];
        if (value.trim() !== '' && value !== 'EDIT_MODE') {
          apiKeyUpdates[key] = value;
        }
      });
      
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKeyUpdates })
      });
      
      const data = await response.json();
      if (data.ok) {
        setSettings(data.settings);
        setMessage({ type: 'success', text: data.message });
        // Update apiKeys state to maintain UI consistency without clearing selections
        setApiKeys(prev => ({
          ...prev,
          ai_provider: data.settings.ai_provider || prev.ai_provider,
          openrouter_model: data.settings.openrouter_model || prev.openrouter_model,
          // Clear only the actual API key fields that were saved
          gemini_api_key: prev.gemini_api_key === 'EDIT_MODE' ? '' : prev.gemini_api_key.length > 0 ? '' : prev.gemini_api_key,
          openrouter_api_key: prev.openrouter_api_key === 'EDIT_MODE' ? '' : prev.openrouter_api_key.length > 0 ? '' : prev.openrouter_api_key,
          google_search_api_key: prev.google_search_api_key === 'EDIT_MODE' ? '' : prev.google_search_api_key.length > 0 ? '' : prev.google_search_api_key,
          google_search_engine_id: prev.google_search_engine_id === 'EDIT_MODE' ? '' : prev.google_search_engine_id.length > 0 ? '' : prev.google_search_engine_id,
          openwebninja_api_key: prev.openwebninja_api_key === 'EDIT_MODE' ? '' : prev.openwebninja_api_key.length > 0 ? '' : prev.openwebninja_api_key,
          ticketmaster_api_key: prev.ticketmaster_api_key === 'EDIT_MODE' ? '' : prev.ticketmaster_api_key.length > 0 ? '' : prev.ticketmaster_api_key
        }));
        setHasUnsavedChanges(false);
        // Clear test results to encourage retesting
        setTestResults(null);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save settings' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setLoading(false);
    }
  };

  const testApis = async () => {
    setTesting(true);
    setTestResults(null);
    
    try {
      const response = await fetch('/api/test-apis', { method: 'POST' });
      const data = await response.json();
      if (data.ok) {
        setTestResults(data.results);
      }
    } catch (error) {
      console.error('Failed to test APIs:', error);
    } finally {
      setTesting(false);
    }
  };

  const handleApiKeyChange = (key: string, value: string) => {
    setApiKeys(prev => ({ ...prev, [key]: value }));
    setHasUnsavedChanges(true);
  };

  const getModelDisplayName = (model: string) => {
    const modelMap: { [key: string]: string } = {
      'deepseek/deepseek-chat-v3.1:free': 'DeepSeek V3.1 (Free)',
      'deepseek/deepseek-r1-0528-qwen3-8b:free': 'DeepSeek R1 8B (Free)',
      'google/gemini-flash-1.5:free': 'Gemini Flash 1.5 (Free)',
      'meta-llama/llama-3.2-3b-instruct:free': 'Llama 3.2 3B (Free)',
      'qwen/qwen-2.5-7b-instruct:free': 'Qwen 2.5 7B (Free)',
      'deepseek/deepseek-r1-0528': 'DeepSeek R1 671B (Paid)',
      'openai/gpt-4o-mini': 'GPT-4o Mini (Paid)',
      'anthropic/claude-3-haiku': 'Claude 3 Haiku (Paid)'
    };
    return modelMap[model] || model;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚙️</span>
              <h2 className="text-xl font-semibold">API Settings</h2>
            </div>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-gray-600 mt-2 mb-4">
            Configure API keys to enhance activity recommendations with real-time data from Google Search and event platforms.
          </p>
          
          {/* Tab Navigation */}
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('ai')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'ai'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              🤖 AI Providers
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'search'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              🔍 Search APIs
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {message && (
            <div className={`mb-6 p-4 rounded-lg ${
              message.type === 'success' 
                ? 'bg-green-50 text-green-800 border border-green-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {message.text}
            </div>
          )}

          {/* Current Configuration Status */}
          {settings && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <span>📊</span>
                Current Configuration
              </h3>
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm text-blue-800 flex items-start gap-2">
                  <span className="text-blue-600 flex-shrink-0">💡</span>
                  <div>
                    <span className="font-medium">Note:</span> API keys may be loaded from environment variables or encrypted storage. 
                    If keys persist after deletion, check your environment variables (GEMINI_API_KEY, OPENROUTER_API_KEY, etc.).
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className={`p-3 rounded-lg border ${
                  settings.gemini_configured 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-gray-100 border-gray-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={settings.gemini_configured ? 'text-green-600' : 'text-gray-500'}>
                      {settings.gemini_configured ? '✅' : '❌'}
                    </span>
                    <span className="font-medium">Gemini AI</span>
                  </div>
                  {settings.gemini_configured && (
                    <div className="text-xs text-gray-600 mt-1">
                      API Key: {settings.gemini_api_key_masked}
                    </div>
                  )}
                </div>
                
                <div className={`p-3 rounded-lg border ${
                  settings.openrouter_configured 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-gray-100 border-gray-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={settings.openrouter_configured ? 'text-green-600' : 'text-gray-500'}>
                      {settings.openrouter_configured ? '✅' : '❌'}
                    </span>
                    <span className="font-medium">OpenRouter AI</span>
                  </div>
                  {settings.openrouter_configured && (
                    <div className="text-xs text-gray-600 mt-1">
                      API Key: {settings.openrouter_api_key_masked}<br/>
                      Model: {settings.openrouter_model}
                    </div>
                  )}
                </div>
                
                <div className={`p-3 rounded-lg border ${
                  settings.google_search_configured 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-gray-100 border-gray-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={settings.google_search_configured ? 'text-green-600' : 'text-gray-500'}>
                      {settings.google_search_configured ? '✅' : '❌'}
                    </span>
                    <span className="font-medium">Google Search</span>
                  </div>
                  {settings.google_search_configured && (
                    <div className="text-xs text-gray-600 mt-1">
                      API Key: {settings.google_search_api_key_masked}
                    </div>
                  )}
                </div>
                
                <div className={`p-3 rounded-lg border ${
                  settings.openwebninja_configured 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-gray-100 border-gray-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={settings.openwebninja_configured ? 'text-green-600' : 'text-gray-500'}>
                      {settings.openwebninja_configured ? '✅' : '❌'}
                    </span>
                    <span className="font-medium">OpenWeb Ninja</span>
                  </div>
                  {settings.openwebninja_configured && (
                    <div className="text-xs text-gray-600 mt-1">
                      API Key: {settings.openwebninja_api_key_masked}
                    </div>
                  )}
                </div>
                
                <div className={`p-3 rounded-lg border ${
                  settings.ticketmaster_configured 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-gray-100 border-gray-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={settings.ticketmaster_configured ? 'text-green-600' : 'text-gray-500'}>
                      {settings.ticketmaster_configured ? '✅' : '❌'}
                    </span>
                    <span className="font-medium">Ticketmaster</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Coming soon</div>
                </div>
              </div>
              
              <div className="mt-4 flex gap-3">
                <button 
                  onClick={testApis}
                  disabled={testing}
                  className="btn btn-secondary flex items-center gap-2"
                >
                  {testing ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full"></div>
                      Testing...
                    </>
                  ) : (
                    <>🔧 Test API Connections</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Test Results */}
          {testResults && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="font-semibold mb-3 text-blue-800">API Test Results</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span>Gemini AI API:</span>
                  <span className={`font-medium ${
                    testResults.gemini.working ? 'text-green-600' : 
                    testResults.gemini.configured ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    {testResults.gemini.working ? '✅ Working' : 
                     testResults.gemini.configured ? `❌ Error: ${testResults.gemini.error}` : 
                     '⚪ Not configured'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>OpenRouter AI API:</span>
                  <span className={`font-medium ${
                    testResults.openrouter.working ? 'text-green-600' : 
                    testResults.openrouter.configured ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    {testResults.openrouter.working ? '✅ Working' : 
                     testResults.openrouter.configured ? `❌ Error: ${testResults.openrouter.error}` : 
                     '⚪ Not configured'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Google Search API:</span>
                  <span className={`font-medium ${
                    testResults.google_search.working ? 'text-green-600' : 
                    testResults.google_search.configured ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    {testResults.google_search.working ? '✅ Working' : 
                     testResults.google_search.configured ? `❌ Error: ${testResults.google_search.error}` : 
                     '⚪ Not configured'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>OpenWeb Ninja API:</span>
                  <span className={`font-medium ${
                    testResults.openwebninja.working ? 'text-green-600' : 
                    testResults.openwebninja.configured ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    {testResults.openwebninja.working ? '✅ Working' : 
                     testResults.openwebninja.configured ? `❌ Error: ${testResults.openwebninja.error}` : 
                     '⚪ Not configured'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content */}
          {activeTab === 'ai' && (
            <div className="space-y-6">
              {/* AI Provider Selection */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-blue-900">
                  <span>🤖</span>
                  AI Provider Selection
                </h3>
                <p className="text-sm text-blue-700 mb-4">
                  Choose your preferred AI provider. The app will automatically fallback to the other provider if your primary choice fails.
                </p>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 border border-blue-200 rounded-lg bg-white/50 hover:bg-white/80 transition-colors cursor-pointer">
                    <input
                      type="radio"
                      name="ai_provider"
                      value="gemini"
                      checked={apiKeys.ai_provider === 'gemini'}
                      onChange={(e) => handleApiKeyChange('ai_provider', e.target.value)}
                      className="text-indigo-600"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">Gemini AI (Google)</div>
                      <div className="text-sm text-gray-600">Google's advanced AI model with built-in JSON mode</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 border border-blue-200 rounded-lg bg-white/50 hover:bg-white/80 transition-colors cursor-pointer">
                    <input
                      type="radio"
                      name="ai_provider"
                      value="openrouter"
                      checked={apiKeys.ai_provider === 'openrouter'}
                      onChange={(e) => handleApiKeyChange('ai_provider', e.target.value)}
                      className="text-indigo-600"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        OpenRouter ({getModelDisplayName(apiKeys.openrouter_model)})
                      </div>
                      <div className="text-sm text-gray-600">Multiple AI models including free options with excellent reasoning</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* API Key Input Forms */}
              <div className="space-y-6">
                {/* Gemini AI */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <span>🤖</span>
                      Gemini AI API
                      {apiKeys.ai_provider === 'gemini' && (
                        <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs">Primary</span>
                      )}
                    </h3>
                    {settings?.gemini_configured && apiKeys.gemini_api_key !== 'EDIT_MODE' && (
                      <button 
                        onClick={() => {
                          handleApiKeyChange('gemini_api_key', 'EDIT_MODE');
                        }}
                        className="text-xs text-indigo-600 hover:text-indigo-800 underline font-medium"
                      >
                        Update Key
                      </button>
                    )}
                  </div>
              <p className="text-sm text-gray-600 mb-4">
                Google's Gemini AI for activity recommendations. 
                <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline ml-1">
                  Get API key here →
                </a>
              </p>
              {settings?.gemini_configured && apiKeys.gemini_api_key !== 'EDIT_MODE' ? (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                  ✅ Configured: {settings.gemini_api_key_masked}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-1">API Key</label>
                  <input
                    type="password"
                    className="input w-full"
                    placeholder="AIza..."
                    value={apiKeys.gemini_api_key === 'EDIT_MODE' ? '' : apiKeys.gemini_api_key}
                    onChange={(e) => handleApiKeyChange('gemini_api_key', e.target.value)}
                  />
                </div>
              )}
            </div>

                {/* OpenRouter */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <span>🚀</span>
                      OpenRouter API ({getModelDisplayName(apiKeys.openrouter_model)})
                      {apiKeys.ai_provider === 'openrouter' && (
                        <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs">Primary</span>
                      )}
                    </h3>
                    {settings?.openrouter_configured && apiKeys.openrouter_api_key !== 'EDIT_MODE' && (
                      <button 
                        onClick={() => {
                          handleApiKeyChange('openrouter_api_key', 'EDIT_MODE');
                        }}
                        className="text-xs text-indigo-600 hover:text-indigo-800 underline font-medium"
                      >
                        Update Key
                      </button>
                    )}
                  </div>
              <p className="text-sm text-gray-600 mb-4">
                Access DeepSeek R1 model for FREE through OpenRouter! Excellent reasoning capabilities. 
                <a href="https://openrouter.ai/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline ml-1">
                  Get API key here →
                </a>
              </p>
              {settings?.openrouter_configured && apiKeys.openrouter_api_key !== 'EDIT_MODE' ? (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                  ✅ Configured: {settings.openrouter_api_key_masked}
                  <div className="text-xs text-gray-600 mt-1">Model: {settings.openrouter_model}</div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">API Key</label>
                    <input
                      type="password"
                      className="input w-full"
                      placeholder="sk-or-..."
                      value={apiKeys.openrouter_api_key === 'EDIT_MODE' ? '' : apiKeys.openrouter_api_key}
                      onChange={(e) => handleApiKeyChange('openrouter_api_key', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Model</label>
                    <select
                      className="input w-full"
                      value={apiKeys.openrouter_model}
                      onChange={(e) => handleApiKeyChange('openrouter_model', e.target.value)}
                    >
                      <option value="deepseek/deepseek-chat-v3.1:free">DeepSeek V3.1 (Free) - Fast & Recommended</option>
                      <option value="deepseek/deepseek-r1-0528-qwen3-8b:free">DeepSeek R1 8B (Free) - Slower but better reasoning</option>
                      <option value="google/gemini-flash-1.5:free">Google Gemini Flash 1.5 (Free) - Very fast</option>
                      <option value="meta-llama/llama-3.2-3b-instruct:free">Meta Llama 3.2 3B (Free) - Lightweight</option>
                      <option value="qwen/qwen-2.5-7b-instruct:free">Qwen 2.5 7B (Free) - Balanced</option>
                      <option value="deepseek/deepseek-r1-0528">DeepSeek R1 671B (Paid) - Premium reasoning</option>
                      <option value="openai/gpt-4o-mini">GPT-4o Mini (Paid)</option>
                      <option value="anthropic/claude-3-haiku">Claude 3 Haiku (Paid)</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">DeepSeek V3.1 is now the default - faster responses than R1 models!</p>
                  </div>
                </div>
              )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'search' && (
            <div className="space-y-6">
              {/* Google Custom Search */}
              <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <span>🔍</span>
                  Google Custom Search API (Recommended)
                </h3>
                {settings?.google_search_configured && apiKeys.google_search_api_key !== 'EDIT_MODE' && apiKeys.google_search_engine_id !== 'EDIT_MODE' && (
                  <button 
                    onClick={() => {
                      handleApiKeyChange('google_search_api_key', 'EDIT_MODE');
                      handleApiKeyChange('google_search_engine_id', 'EDIT_MODE');
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-800 underline font-medium"
                  >
                    Update Keys
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Provides real-time search results similar to Google's AI Overview. 
                <a href="https://developers.google.com/custom-search/v1/introduction" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline ml-1">
                  Get API keys here →
                </a>
              </p>
              {settings?.google_search_configured && apiKeys.google_search_api_key !== 'EDIT_MODE' && apiKeys.google_search_engine_id !== 'EDIT_MODE' ? (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                  ✅ Configured: API Key {settings.google_search_api_key_masked}, Engine ID {settings.google_search_engine_id_masked}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">API Key</label>
                    <input
                      type="password"
                      className="input w-full"
                      placeholder="AIza..."
                      value={apiKeys.google_search_api_key === 'EDIT_MODE' ? '' : apiKeys.google_search_api_key}
                      onChange={(e) => handleApiKeyChange('google_search_api_key', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Search Engine ID</label>
                    <input
                      type="text"
                      className="input w-full"
                      placeholder="Custom Search Engine ID"
                      value={apiKeys.google_search_engine_id === 'EDIT_MODE' ? '' : apiKeys.google_search_engine_id}
                      onChange={(e) => handleApiKeyChange('google_search_engine_id', e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

              {/* OpenWeb Ninja */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <span>🌐</span>
                    OpenWeb Ninja API
                  </h3>
                  {settings?.openwebninja_configured && apiKeys.openwebninja_api_key !== 'EDIT_MODE' && (
                    <button 
                      onClick={() => handleApiKeyChange('openwebninja_api_key', 'EDIT_MODE')}
                      className="text-xs text-indigo-600 hover:text-indigo-800 underline font-medium"
                    >
                      Update Key
                    </button>
                  )}
                </div>
              <p className="text-sm text-gray-600 mb-4">
                Adds real-time family events and activities from OpenWeb Ninja's Events API.
                <a href="https://www.openwebninja.com/api/real-time-events-search" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline ml-1">
                  Get API key here →
                </a>
              </p>
              {settings?.openwebninja_configured && apiKeys.openwebninja_api_key !== 'EDIT_MODE' ? (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                  ✅ Configured: {settings.openwebninja_api_key_masked}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-1">API Key</label>
                  <input
                    type="password"
                    className="input w-full"
                    placeholder="Your OpenWeb Ninja API key"
                    value={apiKeys.openwebninja_api_key === 'EDIT_MODE' ? '' : apiKeys.openwebninja_api_key}
                    onChange={(e) => handleApiKeyChange('openwebninja_api_key', e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Ticketmaster (Coming Soon) */}
            <div className="border border-gray-200 rounded-lg p-4 opacity-50">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <span>🎫</span>
                Ticketmaster API
                <span className="bg-gray-200 text-gray-600 px-2 py-1 rounded-full text-xs">Coming Soon</span>
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Integration with Ticketmaster for concerts and shows will be available in a future update.
              </p>
              <input
                type="password"
                className="input w-full"
                placeholder="Ticketmaster API Key (Coming Soon)"
                disabled
                value={apiKeys.ticketmaster_api_key}
                onChange={(e) => handleApiKeyChange('ticketmaster_api_key', e.target.value)}
              />
              </div>
            </div>
          )}

          {/* Setup Guide Button */}
          <div className="mt-6 text-center">
            <button 
              onClick={() => setShowSetupGuide(true)}
              className="btn btn-secondary flex items-center gap-2 mx-auto"
            >
              📝 Open Detailed Setup Guide
            </button>
            <p className="text-xs text-gray-500 mt-2">Step-by-step instructions for getting API keys</p>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex gap-3 justify-between">
            <div className="flex items-center">
              {hasUnsavedChanges && (
                <span className="text-sm text-amber-600 flex items-center gap-1">
                  <span>⚠️</span>
                  Unsaved changes
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <button 
                onClick={onClose}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button 
                onClick={saveSettings}
                disabled={loading || !hasUnsavedChanges}
                className={`btn ${hasUnsavedChanges ? 'btn-primary' : 'btn-secondary'}`}
              >
                {loading ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                    Saving...
                  </>
                ) : (
                  hasUnsavedChanges ? 'Save Changes' : 'No Changes'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Setup Guide Modal */}
      {showSetupGuide && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📝</span>
                  <h2 className="text-xl font-semibold">API Setup Guide</h2>
                </div>
                <button 
                  onClick={() => setShowSetupGuide(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-gray-600 mt-2">
                Step-by-step instructions to get your API keys for enhanced activity recommendations.
              </p>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-8">
                {/* Quick Start */}
                <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <span>⚡</span>
                    Quick Start (Recommended)
                  </h3>
                  <div className="text-sm text-gray-700 space-y-2">
                    <p className="font-medium">For the best experience with minimal setup:</p>
                    <ol className="list-decimal list-inside space-y-1 ml-4">
                      <li>Get an <strong>OpenRouter API key</strong> (free DeepSeek R1 model)</li>
                      <li>Set OpenRouter as your primary AI provider</li>
                      <li>Test the connection</li>
                      <li>Start finding amazing activities! 🎉</li>
                    </ol>
                    <p className="text-xs text-gray-600 mt-3">
                      💡 You can always add the optional APIs later for enhanced search results.
                    </p>
                  </div>
                </div>
                
                {/* AI Providers */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <span>🤖</span>
                    AI Providers (Choose One)
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* OpenRouter */}
                    <div className="border border-green-200 rounded-lg p-4 bg-green-50">
                      <h4 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
                        <span>🚀</span>
                        OpenRouter (Recommended - FREE!)
                      </h4>
                      <div className="space-y-3">
                        <div className="bg-green-100 p-3 rounded-lg text-sm text-green-800">
                          ✨ <strong>Why OpenRouter?</strong><br/>
                          • DeepSeek R1 model is completely FREE<br/>
                          • Excellent reasoning capabilities<br/>
                          • No rate limits on free tier<br/>
                          • Easy to set up
                        </div>
                        <ol className="list-decimal list-inside space-y-2 text-sm">
                          <li className="flex items-start gap-2">
                            <span className="font-medium">1.</span>
                            <div>
                              Go to <a href="https://openrouter.ai/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">OpenRouter.ai</a>
                            </div>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="font-medium">2.</span>
                            <div>Sign up with your email (free account)</div>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="font-medium">3.</span>
                            <div>Navigate to "Keys" section</div>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="font-medium">4.</span>
                            <div>Create a new API key (starts with <code className="bg-gray-100 px-1 rounded">sk-or-...</code>)</div>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="font-medium">5.</span>
                            <div>Copy and paste it in the settings above</div>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="font-medium">6.</span>
                            <div>Select "DeepSeek R1 8B (Free)" model</div>
                          </li>
                        </ol>
                      </div>
                    </div>
                    
                    {/* Gemini */}
                    <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                      <h4 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                        <span>🤖</span>
                        Gemini AI (Alternative)
                      </h4>
                      <div className="space-y-3">
                        <div className="bg-blue-100 p-3 rounded-lg text-sm text-blue-800">
                          💡 <strong>Good for:</strong><br/>
                          • Familiar Google ecosystem<br/>
                          • Reliable performance<br/>
                          • Built-in JSON mode
                        </div>
                        <ol className="list-decimal list-inside space-y-2 text-sm">
                          <li className="flex items-start gap-2">
                            <span className="font-medium">1.</span>
                            <div>
                              Go to <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">Google AI Studio</a>
                            </div>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="font-medium">2.</span>
                            <div>Sign in with your Google account</div>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="font-medium">3.</span>
                            <div>Click "Create API Key"</div>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="font-medium">4.</span>
                            <div>Copy the API key (starts with <code className="bg-gray-100 px-1 rounded">AIza...</code>)</div>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="font-medium">5.</span>
                            <div>Paste it in the settings above</div>
                          </li>
                        </ol>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Enhanced Search */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <span>🔍</span>
                    Enhanced Search (Optional)
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Google Custom Search */}
                    <div className="border border-purple-200 rounded-lg p-4 bg-purple-50">
                      <h4 className="font-semibold text-purple-800 mb-3 flex items-center gap-2">
                        <span>🔍</span>
                        Google Custom Search
                      </h4>
                      <div className="space-y-3">
                        <div className="bg-purple-100 p-3 rounded-lg text-sm text-purple-800">
                          🌐 <strong>Adds:</strong> Real-time search results similar to Google's AI Overview
                        </div>
                        <ol className="list-decimal list-inside space-y-2 text-sm">
                          <li>Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google Cloud Console</a></li>
                          <li>Enable the Custom Search API</li>
                          <li>Create an API key</li>
                          <li>Set up a Custom Search Engine at <a href="https://cse.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google CSE</a></li>
                          <li>Copy both the API key and Search Engine ID</li>
                        </ol>
                      </div>
                    </div>
                    
                    {/* OpenWeb Ninja */}
                    <div className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                      <h4 className="font-semibold text-orange-800 mb-3 flex items-center gap-2">
                        <span>🌐</span>
                        OpenWeb Ninja Events
                      </h4>
                      <div className="space-y-3">
                        <div className="bg-orange-100 p-3 rounded-lg text-sm text-orange-800">
                          🎭 <strong>Adds:</strong> Real-time family events and activities from event platforms
                        </div>
                        <ol className="list-decimal list-inside space-y-2 text-sm">
                          <li>Go to <a href="https://www.openwebninja.com/api/real-time-events-search" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">OpenWeb Ninja Events API</a></li>
                          <li>Sign up for a free account</li>
                          <li>Get your API key</li>
                          <li>Paste it in the settings</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-200 flex-shrink-0">
              <div className="flex justify-end">
                <button 
                  onClick={() => setShowSetupGuide(false)}
                  className="btn btn-primary"
                >
                  Got it! Close Guide
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
