import React, { useRef, useState } from 'react';
import { motion, useAnimation, PanInfo } from 'motion/react';

interface SwipeableItemProps {
  children: React.ReactNode;
  rightActions?: React.ReactNode;
  leftActions?: React.ReactNode;
  onActionClick?: () => void;
}

export const SwipeableItem: React.FC<SwipeableItemProps> = ({
  children,
  rightActions,
  leftActions,
  onActionClick
}) => {
  const controls = useAnimation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDragEnd = (event: any, info: PanInfo) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;

    if (offset < -50 || velocity < -500) {
      if (rightActions) {
        controls.start({ x: -120, transition: { type: 'spring', stiffness: 400, damping: 30 } });
        setIsOpen(true);
      } else {
        controls.start({ x: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } });
        setIsOpen(false);
      }
    } else if (offset > 50 || velocity > 500) {
      if (leftActions) {
        controls.start({ x: 120, transition: { type: 'spring', stiffness: 400, damping: 30 } });
        setIsOpen(true);
      } else {
        controls.start({ x: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } });
        setIsOpen(false);
      }
    } else {
      controls.start({ x: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } });
      setIsOpen(false);
    }
  };

  const close = () => {
    controls.start({ x: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } });
    setIsOpen(false);
  };

  return (
    <div className="relative overflow-hidden w-full" ref={containerRef}>
      {/* Background Actions */}
      <div className="absolute inset-0 flex justify-between items-center z-0 bg-gray-100">
        <div className="flex-1 h-full flex items-center justify-start" onClick={() => { onActionClick?.(); close(); }}>
          {leftActions}
        </div>
        <div className="flex-1 h-full flex items-center justify-end" onClick={() => { onActionClick?.(); close(); }}>
          {rightActions}
        </div>
      </div>

      {/* Foreground Content */}
      <motion.div
        drag="x"
        dragConstraints={{ left: rightActions ? -120 : 0, right: leftActions ? 120 : 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        animate={controls}
        className="relative z-10 bg-white w-full h-full"
        style={{ touchAction: 'pan-y' }}
        onClick={() => {
          if (isOpen) close();
        }}
      >
        {children}
      </motion.div>
    </div>
  );
};
