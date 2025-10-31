import React from 'react';
import { motion } from 'framer-motion';
import { AnimatedModal } from './AnimatedModal';
import { MapPin, X } from 'lucide-react';

interface ExclusionManagerProps {
  isOpen: boolean;
  onClose: () => void;
  exclusionList: {[location: string]: string[]};
  removeFromExclusionList: (location: string, attraction: string) => Promise<boolean>;
}

export function ExclusionManager({
  isOpen,
  onClose,
  exclusionList,
  removeFromExclusionList
}: ExclusionManagerProps) {
  
  const handleRemove = async (location: string, attraction: string) => {
    await removeFromExclusionList(location, attraction);
  };

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onClose}
      title="Excluded Activities"
      maxHeight="80vh"
    >
      <div className="space-y-4">
        {/* Description */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🎯</span>
            <div>
              <h3 className="text-sm font-semibold text-blue-900 mb-1">
                Manage Exclusions
              </h3>
              <p className="text-xs text-blue-700">
                Remove activities you don't want to see in future recommendations. Exclusions are saved per location.
              </p>
            </div>
          </div>
        </div>

        {/* Exclusion List */}
        {Object.keys(exclusionList).length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl block mb-4">🎯</span>
            <h3 className="text-lg font-bold text-gray-900 mb-2">No exclusions yet!</h3>
            <p className="text-sm text-gray-600">
              Use the "Don't suggest this again" button on activities to add exclusions.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(exclusionList).map(([location, attractions], idx) => (
              <motion.div
                key={location}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="border-2 border-gray-200 rounded-2xl p-4 bg-white"
              >
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-5 h-5 text-purple-600" />
                  <h3 className="font-bold text-gray-900 flex-1">{location}</h3>
                  <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-semibold">
                    {attractions.length} excluded
                  </span>
                </div>
                <div className="space-y-2">
                  {attractions.map((attraction, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 + index * 0.03 }}
                      className="flex items-center justify-between bg-red-50 border-2 border-red-200 rounded-xl p-3 group hover:bg-red-100 transition-colors"
                    >
                      <span className="text-sm text-gray-800 font-medium flex-1 pr-2">
                        {attraction}
                      </span>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleRemove(location, attraction)}
                        className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                        title="Remove from exclusions"
                      >
                        <X className="w-3 h-3" />
                        Remove
                      </motion.button>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AnimatedModal>
  );
}

