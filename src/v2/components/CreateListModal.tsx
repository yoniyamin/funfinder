import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AnimatedModal } from './AnimatedModal';
import { X, Plus } from 'lucide-react';

interface CreateListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, location?: string) => Promise<void>;
  zIndex?: number;
}

export function CreateListModal({ isOpen, onClose, onCreate, zIndex }: CreateListModalProps) {
  const [listName, setListName] = useState('');
  const [location, setLocation] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!listName.trim()) {
      setError('Please enter a list name');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      await onCreate(listName.trim(), location.trim() || undefined);
      // Reset form
      setListName('');
      setLocation('');
      onClose();
    } catch (err) {
      setError('Failed to create list. Please try again.');
      console.error('Error creating list:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      setListName('');
      setLocation('');
      setError('');
      onClose();
    }
  };

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create New List"
      maxHeight="50vh"
      zIndex={zIndex}
    >
      <div className="space-y-4">
        {/* List Name Input */}
        <div>
          <label htmlFor="list-name" className="block text-sm font-bold text-gray-900 mb-2">
            List Name <span className="text-red-500">*</span>
          </label>
          <input
            id="list-name"
            type="text"
            value={listName}
            onChange={(e) => setListName(e.target.value)}
            placeholder="e.g., Summer Weekend Plans"
            className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#2E8B92] text-gray-900 transition-all"
            disabled={isCreating}
            maxLength={100}
          />
        </div>

        {/* Location Input (Optional) */}
        <div>
          <label htmlFor="list-location" className="block text-sm font-bold text-gray-900 mb-2">
            Location <span className="text-gray-500 text-xs font-normal">(optional)</span>
          </label>
          <input
            id="list-location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g., San Francisco, CA"
            className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#2E8B92] text-gray-900 transition-all"
            disabled={isCreating}
            maxLength={100}
          />
        </div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-red-50 border-2 border-red-200 rounded-xl"
          >
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </motion.div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleClose}
            disabled={isCreating}
            className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors disabled:opacity-50"
          >
            Cancel
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleCreate}
            disabled={isCreating || !listName.trim()}
            className="flex-1 px-4 py-3 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ 
              background: isCreating || !listName.trim() 
                ? '#cccccc' 
                : 'linear-gradient(135deg, #2E8B92 0%, #56B88F 100%)' 
            }}
          >
            {isCreating ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-5 h-5" />
                Create List
              </>
            )}
          </motion.button>
        </div>
      </div>
    </AnimatedModal>
  );
}

