import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { X } from 'lucide-react';

interface AnimatedModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxHeight?: string;
  zIndex?: number;
}

export function AnimatedModal({ 
  isOpen, 
  onClose, 
  title, 
  children,
  maxHeight = '85vh',
  zIndex = 100
}: AnimatedModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  
  // Close on ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle drag end - close if swiped down enough
  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);
    // If dragged down more than 150px or with high velocity, close
    if (info.offset.y > 150 || info.velocity.y > 500) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isDragging ? 0.5 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            style={{ zIndex }}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={handleDragEnd}
            transition={{ 
              type: 'spring', 
              damping: 30, 
              stiffness: 300 
            }}
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl overflow-hidden shadow-2xl"
            style={{ maxHeight, touchAction: 'none', zIndex: zIndex + 1 }}
          >
            {/* Drag Handle - More prominent */}
            <div className="flex justify-center pt-4 pb-2 cursor-grab active:cursor-grabbing">
              <motion.div 
                className="w-12 h-1.5 bg-gray-300 rounded-full"
                animate={{ 
                  backgroundColor: isDragging ? '#56B88F' : '#d1d5db',
                  scale: isDragging ? 1.2 : 1
                }}
                transition={{ duration: 0.2 }}
              ></motion.div>
            </div>
            
            {/* Header */}
            {title && (
              <div className="flex items-center justify-between px-6 pb-4 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">{title}</h2>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </motion.button>
              </div>
            )}
            
            {/* Content - Scrollable */}
            <div className="overflow-y-auto" style={{ maxHeight: `calc(${maxHeight} - 80px)` }}>
              <div className="px-6 py-4">
                {children}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

