import React from 'react';
import { motion } from 'motion/react';

interface DiceProps {
  value: number;
  rolling: boolean;
}

const Dice: React.FC<DiceProps> = ({ value, rolling }) => {
  // Rotation mapping for each face
  const rotations: Record<number, string> = {
    1: 'rotateX(0deg) rotateY(0deg)',
    2: 'rotateX(-90deg) rotateY(0deg)',
    3: 'rotateX(0deg) rotateY(90deg)',
    4: 'rotateX(0deg) rotateY(-90deg)',
    5: 'rotateX(90deg) rotateY(0deg)',
    6: 'rotateX(180deg) rotateY(0deg)',
  };

  return (
    <div className="w-16 h-16 [perspective:400px]">
      <motion.div
        animate={
          rolling
            ? {
                rotateX: [0, 360, 720, 1080],
                rotateY: [0, 360, 720, 1080],
              }
            : {
                transform: rotations[value] || rotations[1],
              }
        }
        transition={
          rolling
            ? { duration: 2, repeat: Infinity, ease: "linear" }
            : { duration: 0.5, type: "spring" }
        }
        className="relative w-full h-full [transform-style:preserve-3d]"
      >
        {/* Faces */}
        {[1, 2, 3, 4, 5, 6].map((face) => (
          <div
            key={face}
            className={`absolute w-full h-full bg-white border-2 border-gray-300 rounded-lg flex items-center justify-center text-2xl font-bold text-gray-800 shadow-inner [backface-visibility:hidden] ${
              face === 1 ? '[transform:translateZ(32px)]' :
              face === 2 ? '[transform:rotateX(90deg)translateZ(32px)]' :
              face === 3 ? '[transform:rotateY(-90deg)translateZ(32px)]' :
              face === 4 ? '[transform:rotateY(90deg)translateZ(32px)]' :
              face === 5 ? '[transform:rotateX(-90deg)translateZ(32px)]' :
              '[transform:rotateX(180deg)translateZ(32px)]'
            }`}
          >
            <div className="grid grid-cols-3 gap-1 p-2 w-full h-full">
               {/* Simplified dots for dice faces */}
               {Array.from({ length: 9 }).map((_, i) => {
                 const showDot = (
                   (face === 1 && i === 4) ||
                   (face === 2 && (i === 0 || i === 8)) ||
                   (face === 3 && (i === 0 || i === 4 || i === 8)) ||
                   (face === 4 && (i === 0 || i === 2 || i === 6 || i === 8)) ||
                   (face === 5 && (i === 0 || i === 2 || i === 4 || i === 6 || i === 8)) ||
                   (face === 6 && (i === 0 || i === 2 || i === 3 || i === 5 || i === 6 || i === 8))
                 );
                 return (
                   <div key={i} className={`w-2 h-2 rounded-full ${showDot ? 'bg-red-600' : 'bg-transparent'}`} />
                 );
               })}
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  );
};

export default Dice;
