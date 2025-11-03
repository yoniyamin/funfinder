import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { AnimatedModal } from './AnimatedModal';
import { CreateListModal } from './CreateListModal';
import { 
  MapPin, Share2, Trash2, Plus, List as ListIcon, GripVertical, 
  Ban, Heart, Loader, Map, X, ChevronDown, ChevronUp, Calendar, 
  Clock, Users, DollarSign, Sun, Cloud, CloudRain, Eye, ExternalLink
} from 'lucide-react';
import type { SavedActivity, TripList } from '../../lib/schema';
import { shareListCard } from '../../lib/share-list';

interface MyTripsModalProps {
  isOpen: boolean;
  onClose: () => void;
  favorites: SavedActivity[];
  tripLists: TripList[];
  exclusionList: {[location: string]: string[]};
  removeFromExclusionList: (location: string, attraction: string) => Promise<boolean>;
  onCreateList: (name: string, location?: string) => Promise<void>;
  onDeleteList: (listId: string) => Promise<void>;
  onRemoveFavorite: (activityId: string) => Promise<void>;
  onAddActivityToList: (listId: string, activityId: string) => Promise<void>;
  onRemoveActivityFromList: (listId: string, activityId: string) => Promise<void>;
  onReorderList: (listId: string, activityIds: string[]) => Promise<void>;
  onRefreshData: () => Promise<void>;
}

type TabType = 'trips' | 'rules';
type ViewMode = 'location' | 'lists';

export function MyTripsModal({
  isOpen,
  onClose,
  favorites,
  tripLists,
  exclusionList,
  removeFromExclusionList,
  onCreateList,
  onDeleteList,
  onRemoveFavorite,
  onAddActivityToList,
  onRemoveActivityFromList,
  onReorderList,
  onRefreshData
}: MyTripsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('trips');
  const [viewMode, setViewMode] = useState<ViewMode>('location');
  const [showCreateList, setShowCreateList] = useState(false);
  const [sharingList, setSharingList] = useState<string | null>(null);
  const [expandedLocation, setExpandedLocation] = useState<string | null>(null);
  const [expandedList, setExpandedList] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<SavedActivity | null>(null);
  const [showAddToListModal, setShowAddToListModal] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{activityId: string; title: string} | null>(null);
  const [showDeleteListConfirm, setShowDeleteListConfirm] = useState<{listId: string; name: string} | null>(null);

  // Reset to trips tab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab('trips');
      setSelectedActivity(null);
    }
  }, [isOpen]);

  // Group favorites by location
  const favoritesByLocation = favorites.reduce((acc, activity) => {
    const loc = activity.location || 'Unknown Location';
    if (!acc[loc]) acc[loc] = [];
    acc[loc].push(activity);
    return acc;
  }, {} as {[location: string]: SavedActivity[]});

  // Get activities for a trip list
  const getListActivities = (list: TripList): SavedActivity[] => {
    return list.activityIds
      .map(id => favorites.find(a => a.activityId === id))
      .filter(Boolean) as SavedActivity[];
  };

  const handleDragEnd = async (result: DropResult, listId: string) => {
    if (!result.destination) return;

    const activities = getListActivities(tripLists.find(l => l.listId === listId)!);
    const reordered = Array.from(activities);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

    await onReorderList(listId, reordered.map(a => a.activityId));
    await onRefreshData();
  };

  const handleShareList = async (list: TripList) => {
    setSharingList(list.listId);
    try {
      const activities = getListActivities(list);
      await shareListCard(list, activities);
    } catch (error) {
      console.error('Error sharing list:', error);
    } finally {
      setSharingList(null);
    }
  };

  const handleDeleteList = async (listId: string, name: string) => {
    setShowDeleteListConfirm({ listId, name });
  };

  const confirmDeleteList = async () => {
    if (showDeleteListConfirm) {
      await onDeleteList(showDeleteListConfirm.listId);
      await onRefreshData();
      setShowDeleteListConfirm(null);
    }
  };

  const handleRemoveActivity = async (activityId: string, title: string) => {
    setShowDeleteConfirm({ activityId, title });
  };

  const confirmRemoveActivity = async () => {
    if (showDeleteConfirm) {
      await onRemoveFavorite(showDeleteConfirm.activityId);
      await onRefreshData();
      setSelectedActivity(null);
      setShowDeleteConfirm(null);
    }
  };

  const toggleLocation = (location: string) => {
    setExpandedLocation(expandedLocation === location ? null : location);
  };

  const toggleList = (listId: string) => {
    setExpandedList(expandedList === listId ? null : listId);
  };

  const getWeatherIcon = (weatherFit: string) => {
    if (weatherFit === 'good') return <Sun className="w-4 h-4" />;
    if (weatherFit === 'bad') return <CloudRain className="w-4 h-4" />;
    return <Cloud className="w-4 h-4" />;
  };

  return (
    <>
      <AnimatedModal
        isOpen={isOpen}
        onClose={onClose}
        maxHeight="95vh"
      >
        {/* Custom Header with Tabs */}
        <div className="sticky top-0 bg-white z-10 border-b border-gray-200 -mx-6 px-6 -mt-4 pt-2 pb-0">
          <h2 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Baloo 2, sans-serif' }}>
            My Trips
          </h2>
          
          {/* Tab Switcher */}
          <div className="flex gap-2 mb-4">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveTab('trips')}
              className={`py-3 px-4 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'trips'
                  ? 'text-white shadow-md'
                  : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
              }`}
              style={activeTab === 'trips' ? { 
                background: 'linear-gradient(135deg, #2E8B92 0%, #56B88F 100%)',
                flex: '2'
              } : { flex: '2' }}
            >
              <Heart className="w-4 h-4 inline-block mr-2" />
              My Trips
            </motion.button>
            
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveTab('rules')}
              className={`py-3 px-4 rounded-xl font-bold text-sm transition-all ${
                activeTab === 'rules'
                  ? 'text-white shadow-md'
                  : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
              }`}
              style={activeTab === 'rules' ? { 
                background: 'linear-gradient(135deg, #F26B8A 0%, #F2A15F 100%)',
                flex: '1'
              } : { flex: '1' }}
            >
              <Ban className="w-4 h-4 inline-block mr-2" />
              Trip Rules
            </motion.button>
          </div>
        </div>

        {/* Fixed height content area */}
        <div style={{ minHeight: '60vh', maxHeight: '70vh' }}>
          {/* Tab Content */}
          <AnimatePresence mode="wait">
            {activeTab === 'trips' ? (
              <motion.div
                key="trips"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {/* View Mode Toggle */}
                <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setViewMode('location')}
                    className={`flex-1 py-2 px-4 rounded-lg font-semibold text-sm transition-all ${
                      viewMode === 'location'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600'
                    }`}
                  >
                    <Map className="w-4 h-4 inline-block mr-2" />
                    By Location
                  </motion.button>
                  
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setViewMode('lists')}
                    className={`flex-1 py-2 px-4 rounded-lg font-semibold text-sm transition-all ${
                      viewMode === 'lists'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600'
                    }`}
                  >
                    <ListIcon className="w-4 h-4 inline-block mr-2" />
                    My Lists
                  </motion.button>
                </div>

                {/* Content based on view mode */}
                {viewMode === 'location' ? (
                  // By Location View - Collapsible
                  <div className="space-y-3">
                    {Object.keys(favoritesByLocation).length === 0 ? (
                      <div className="text-center py-12">
                        <Heart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">No favorites yet</h3>
                        <p className="text-sm text-gray-600">
                          Save activities from your search results to see them here!
                        </p>
                      </div>
                    ) : (
                      Object.entries(favoritesByLocation).map(([location, activities]) => (
                        <div key={location} className="border border-gray-200 rounded-xl overflow-hidden">
                          {/* Location Header - Clickable */}
                          <motion.button
                            whileTap={{ scale: 0.99 }}
                            onClick={() => toggleLocation(location)}
                            className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <MapPin className="w-5 h-5" style={{ color: '#2E8B92' }} />
                              <h3 className="font-bold text-gray-900">{location}</h3>
                              <span className="text-sm text-gray-500">({activities.length})</span>
                            </div>
                            {expandedLocation === location ? (
                              <ChevronUp className="w-5 h-5 text-gray-500" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-gray-500" />
                            )}
                          </motion.button>
                          
                          {/* Collapsed Activities */}
                          <AnimatePresence>
                            {expandedLocation === location && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="p-3 space-y-3 bg-gray-50">
                                  {activities.map((activity) => (
                                    <motion.div
                                      key={activity.activityId}
                                      initial={{ opacity: 0, y: 10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      className="rounded-xl p-4"
                                      style={{
                                        background: 'white',
                                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                                        border: '3px solid transparent',
                                        backgroundImage: 'linear-gradient(white, white), linear-gradient(135deg, #2E8B92 0%, #56B88F 50%, #F2A15F 100%)',
                                        backgroundOrigin: 'border-box',
                                        backgroundClip: 'padding-box, border-box'
                                      }}
                                    >
                                      {selectedActivity?.activityId === activity.activityId ? (
                                        // Full Activity Card - Click anywhere to collapse
                                        <div className="space-y-3 cursor-pointer" onClick={() => setSelectedActivity(null)}>
                                          <div className="flex items-start justify-between">
                                            <h4 className="font-bold text-gray-900 text-base" style={{ fontFamily: 'Baloo 2, sans-serif' }}>
                                              {activity.title}
                                            </h4>
                                          </div>
                                          
                                          {activity.address && (
                                            <p className="text-xs text-gray-600 flex items-center gap-1">
                                              <MapPin className="w-3 h-3" />
                                              {activity.address}
                                            </p>
                                          )}
                                          
                                          {activity.description && (
                                            <p className="text-sm text-gray-700">{activity.description}</p>
                                          )}
                                          
                                          {/* Badges */}
                                          <div className="flex flex-wrap gap-2 text-xs">
                                            {activity.category && (
                                              <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-md font-semibold">
                                                {activity.category}
                                              </span>
                                            )}
                                            {activity.duration_hours && (
                                              <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-md font-semibold flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {activity.duration_hours}h
                                              </span>
                                            )}
                                            {activity.free !== undefined && (
                                              <span className={`px-2 py-1 rounded-md font-semibold flex items-center gap-1 ${
                                                activity.free 
                                                  ? 'bg-green-50 text-green-700' 
                                                  : 'bg-amber-50 text-amber-700'
                                              }`}>
                                                <DollarSign className="w-3 h-3" />
                                                {activity.free ? 'Free' : 'Paid'}
                                              </span>
                                            )}
                                            {activity.weather_fit && (
                                              <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded-md font-semibold flex items-center gap-1">
                                                {getWeatherIcon(activity.weather_fit)}
                                                {activity.weather_fit === 'good' ? 'Outdoor' : 
                                                 activity.weather_fit === 'ok' ? 'Flexible' : 
                                                 'Indoor'}
                                              </span>
                                            )}
                                          </div>
                                          
                                          {activity.notes && (
                                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                                              <p className="text-xs text-amber-800">⚠️ {activity.notes}</p>
                                            </div>
                                          )}
                                          
                                          {/* Action Buttons */}
                                          <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                                            {activity.booking_url ? (
                                              <a
                                                href={activity.booking_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex-1 px-4 py-3 text-white font-bold rounded-xl text-center flex items-center justify-center gap-2 text-sm"
                                                style={{ background: 'linear-gradient(135deg, #2E8B92 0%, #56B88F 100%)' }}
                                              >
                                                <Calendar className="w-4 h-4" />
                                                Book Now
                                              </a>
                                            ) : activity.address && (
                                              <a
                                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activity.title + ', ' + activity.address)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex-1 px-4 py-3 text-white font-bold rounded-xl text-center flex items-center justify-center gap-2 text-sm"
                                                style={{ background: 'linear-gradient(135deg, #2E8B92 0%, #56B88F 100%)' }}
                                              >
                                                <MapPin className="w-4 h-4" />
                                                View on Map
                                              </a>
                                            )}
                                            <button
                                              onClick={async () => {
                                                try {
                                                  // Share logic here
                                                  console.log('Share activity:', activity.title);
                                                } catch (error) {
                                                  console.error('Error sharing:', error);
                                                }
                                              }}
                                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                              title="Share this activity"
                                            >
                                              <Share2 className="w-4 h-4 text-gray-600" />
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        // Collapsed Card
                                        <div className="flex items-start gap-3">
                                          <div className="flex-1 cursor-pointer" onClick={() => setSelectedActivity(activity)}>
                                            <h4 className="font-bold text-gray-900 text-sm mb-1">{activity.title}</h4>
                                            {activity.address && (
                                              <p className="text-xs text-gray-600 mb-1 flex items-center gap-1">
                                                <MapPin className="w-3 h-3" />
                                                {activity.address.split(',').slice(0, 2).join(',')}
                                              </p>
                                            )}
                                            {activity.description && (
                                              <p className="text-xs text-gray-600 line-clamp-1">{activity.description}</p>
                                            )}
                                          </div>
                                          
                                          <div className="flex gap-1">
                                            <motion.button
                                              whileHover={{ scale: 1.1 }}
                                              whileTap={{ scale: 0.9 }}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setShowAddToListModal(activity.activityId);
                                              }}
                                              className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
                                              title="Add to list"
                                            >
                                              <Plus className="w-4 h-4 text-blue-600" />
                                            </motion.button>
                                            <motion.button
                                              whileHover={{ scale: 1.1 }}
                                              whileTap={{ scale: 0.9 }}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemoveActivity(activity.activityId, activity.title);
                                              }}
                                              className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                                              title="Remove from favorites"
                                            >
                                              <Trash2 className="w-4 h-4 text-red-600" />
                                            </motion.button>
                                          </div>
                                        </div>
                                      )}
                                    </motion.div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  // My Lists View
                  <div className="space-y-4">
                    {/* Trip Lists */}
                    {tripLists.length === 0 ? (
                      <div className="text-center py-12">
                        <ListIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">No lists yet</h3>
                        <p className="text-sm text-gray-600">
                          Create a list to organize your favorite activities!
                        </p>
                      </div>
                    ) : (
                      tripLists.map((list) => {
                        const activities = getListActivities(list);
                        
                        return (
                          <div key={list.listId} className="border border-gray-200 rounded-xl overflow-hidden">
                            {/* List Header */}
                            <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                              <div className="flex-1" onClick={() => toggleList(list.listId)} style={{ cursor: 'pointer' }}>
                                <h3 className="font-bold text-gray-900">{list.name}</h3>
                                {list.location && (
                                  <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                                    <MapPin className="w-3 h-3" />
                                    {list.location}
                                  </p>
                                )}
                              </div>
                              
                              <div className="flex gap-2">
                                <motion.button
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => handleShareList(list)}
                                  disabled={sharingList === list.listId}
                                  className="p-2 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
                                  title="Share list"
                                >
                                  {sharingList === list.listId ? (
                                    <Loader className="w-4 h-4 text-blue-600 animate-spin" />
                                  ) : (
                                    <Share2 className="w-4 h-4 text-blue-600" />
                                  )}
                                </motion.button>
                                
                                <motion.button
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => handleDeleteList(list.listId, list.name)}
                                  className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                                  title="Delete list"
                                >
                                  <Trash2 className="w-4 h-4 text-red-600" />
                                </motion.button>
                                
                                {expandedList === list.listId ? (
                                  <ChevronUp className="w-5 h-5 text-gray-500" />
                                ) : (
                                  <ChevronDown className="w-5 h-5 text-gray-500" />
                                )}
                              </div>
                            </div>

                            {/* Calendar-style Activities */}
                            <AnimatePresence>
                              {expandedList === list.listId && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <DragDropContext onDragEnd={(result) => handleDragEnd(result, list.listId)}>
                                    <Droppable droppableId={list.listId}>
                                      {(provided) => (
                                        <div
                                          {...provided.droppableProps}
                                          ref={provided.innerRef}
                                          className="p-3 space-y-2 bg-white"
                                        >
                                          {activities.length === 0 ? (
                                            <div className="text-center py-8 text-gray-500 text-sm">
                                              No activities in this list yet
                                            </div>
                                          ) : (
                                            activities.map((activity, index) => (
                                              <Draggable
                                                key={activity.activityId}
                                                draggableId={activity.activityId}
                                                index={index}
                                              >
                                                {(provided, snapshot) => (
                                                  <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    className={`bg-gray-50 rounded-xl p-3 border ${
                                                      snapshot.isDragging ? 'border-[#2E8B92] shadow-lg' : 'border-gray-200'
                                                    }`}
                                                  >
                                                    <div className="flex items-center gap-3">
                                                      <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                                                        <GripVertical className="w-5 h-5 text-gray-400" />
                                                      </div>
                                                      
                                                      <div className="flex-1">
                                                        <h4 className="font-bold text-gray-900 text-sm">{activity.title}</h4>
                                                        <div className="flex flex-wrap gap-2 mt-1">
                                                          {activity.duration_hours && (
                                                            <span className="text-xs text-gray-600 flex items-center gap-1">
                                                              <Clock className="w-3 h-3" />
                                                              {activity.duration_hours}h
                                                            </span>
                                                          )}
                                                          {activity.category && (
                                                            <span className="text-xs text-gray-600">• {activity.category}</span>
                                                          )}
                                                        </div>
                                                      </div>
                                                      
                                                      <motion.button
                                                        whileHover={{ scale: 1.1 }}
                                                        whileTap={{ scale: 0.9 }}
                                                        onClick={async () => {
                                                          await onRemoveActivityFromList(list.listId, activity.activityId);
                                                          await onRefreshData();
                                                        }}
                                                        className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                                                        title="Remove from list"
                                                      >
                                                        <Trash2 className="w-4 h-4 text-red-600" />
                                                      </motion.button>
                                                    </div>
                                                  </div>
                                                )}
                                              </Draggable>
                                            ))
                                          )}
                                          {provided.placeholder}
                                        </div>
                                      )}
                                    </Droppable>
                                  </DragDropContext>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })
                    )}
                    
                    {/* Create New List Button - Bottom */}
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setShowCreateList(true)}
                      className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 font-semibold hover:border-[#2E8B92] hover:text-[#2E8B92] transition-colors flex items-center justify-center gap-2 mt-4"
                    >
                      <Plus className="w-5 h-5" />
                      Create New List
                    </motion.button>
                  </div>
                )}
              </motion.div>
            ) : (
              // Trip Rules Tab
              <motion.div
                key="rules"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">⚠️</span>
                      <div>
                        <h3 className="text-sm font-semibold text-amber-900 mb-1">
                          Exclusion Rules
                        </h3>
                        <p className="text-xs text-amber-700">
                          Activities you exclude won't appear in future search results for that location.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Inline Exclusion Manager Content */}
                  {Object.keys(exclusionList).length === 0 ? (
                    <div className="text-center py-12">
                      <Ban className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-bold text-gray-900 mb-2">No exclusions</h3>
                      <p className="text-sm text-gray-600">
                        Activities you exclude will appear here
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(exclusionList).map(([location, attractions]) => (
                        <div key={location} className="space-y-2">
                          <div className="flex items-center gap-2 mb-2">
                            <MapPin className="w-5 h-5 text-red-500" />
                            <h3 className="font-bold text-gray-900">{location}</h3>
                            <span className="text-sm text-gray-500">({attractions.length})</span>
                          </div>
                          
                          <div className="space-y-2">
                            {attractions.map((attraction, idx) => (
                              <motion.div
                                key={`${location}-${attraction}-${idx}`}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between"
                              >
                                <span className="text-sm text-gray-900">{attraction}</span>
                                <motion.button
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    try {
                                      await removeFromExclusionList(location, attraction);
                                    } catch (error) {
                                      console.error('Error removing exclusion:', error);
                                    }
                                  }}
                                  className="p-1.5 hover:bg-red-200 rounded-lg transition-colors"
                                  title="Remove exclusion"
                                >
                                  <X className="w-4 h-4 text-red-700" />
                                </motion.button>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </AnimatedModal>

      {/* Create List Modal */}
      <CreateListModal
        isOpen={showCreateList}
        onClose={() => setShowCreateList(false)}
        onCreate={async (name, location) => {
          await onCreateList(name, location);
          await onRefreshData();
        }}
        zIndex={110}
      />

      {/* Add to List Modal */}
      <AnimatePresence>
        {showAddToListModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110] p-4"
            onClick={() => setShowAddToListModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Baloo 2, sans-serif' }}>
                  Add to List
                </h3>
                <button
                  onClick={() => setShowAddToListModal(null)}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              {tripLists.length === 0 ? (
                <div className="text-center py-8">
                  <ListIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 mb-4">No lists yet. Create one first!</p>
                  <button
                    onClick={() => {
                      setShowAddToListModal(null);
                      setShowCreateList(true);
                    }}
                    className="px-4 py-2 text-white font-semibold rounded-xl"
                    style={{ background: 'linear-gradient(135deg, #2E8B92 0%, #56B88F 100%)' }}
                  >
                    Create List
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {tripLists.map((list) => (
                    <motion.button
                      key={list.listId}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={async () => {
                        await onAddActivityToList(list.listId, showAddToListModal);
                        await onRefreshData();
                        setShowAddToListModal(null);
                      }}
                      className="w-full p-4 bg-gray-50 hover:bg-gray-100 rounded-xl text-left transition-colors border border-gray-200"
                    >
                      <div className="font-bold text-gray-900">{list.name}</div>
                      {list.location && (
                        <div className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3" />
                          {list.location}
                        </div>
                      )}
                    </motion.button>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Activity Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110] p-4"
            onClick={() => setShowDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Baloo 2, sans-serif' }}>
                  Remove from Favorites?
                </h3>
              </div>

              <p className="text-gray-700 mb-6">
                Are you sure you want to remove <strong>{showDeleteConfirm.title}</strong> from your favorites?
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRemoveActivity}
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors"
                >
                  Remove
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete List Confirmation Modal */}
      <AnimatePresence>
        {showDeleteListConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110] p-4"
            onClick={() => setShowDeleteListConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Baloo 2, sans-serif' }}>
                  Delete List?
                </h3>
              </div>

              <p className="text-gray-700 mb-2">
                Are you sure you want to delete <strong>{showDeleteListConfirm.name}</strong>?
              </p>
              <p className="text-sm text-gray-600 mb-6">
                Activities will remain in your favorites.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteListConfirm(null)}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteList}
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
