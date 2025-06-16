/**
 * Smart Action Chip Component
 * Mobile-optimized chip component for suggested questions
 */

import React from 'react';
import { motion } from 'framer-motion';
import { HelpCircle, ArrowRight, Lightbulb, Search } from 'lucide-react';
import { FollowUpQuestion } from '@/types/chat';
import { cn } from '@/lib/utils';

interface SmartActionChipProps {
  question: FollowUpQuestion;
  onClick: (question: string) => void;
  index: number;
  className?: string;
}

const getCategoryIcon = (category?: string) => {
  switch (category) {
    case 'clarification':
      return <HelpCircle size={12} className="text-blue-500" />;
    case 'related':
      return <Search size={12} className="text-green-500" />;
    case 'practical':
      return <Lightbulb size={12} className="text-orange-500" />;
    case 'explore':
      return <ArrowRight size={12} className="text-purple-500" />;
    default:
      return <HelpCircle size={12} className="text-gray-500" />;
  }
};

const getCategoryColor = (category?: string) => {
  switch (category) {
    case 'clarification':
      return 'border-blue-100 hover:border-blue-300 hover:bg-blue-50/50';
    case 'related':
      return 'border-green-100 hover:border-green-300 hover:bg-green-50/50';
    case 'practical':
      return 'border-orange-100 hover:border-orange-300 hover:bg-orange-50/50';
    case 'explore':
      return 'border-purple-100 hover:border-purple-300 hover:bg-purple-50/50';
    default:
      return 'border-gray-100 hover:border-gray-300 hover:bg-gray-50/50';
  }
};

const SmartActionChip: React.FC<SmartActionChipProps> = ({
  question,
  onClick,
  index,
  className = '',
}) => {
  // Ensure we have a proper question object and extract the question text safely
  const questionText = React.useMemo(() => {
    if (typeof question === 'string') {
      return question;
    }
    if (question && typeof question === 'object' && 'question' in question) {
      return typeof question.question === 'string' ? question.question : 'Question not available';
    }
    return 'Question not available';
  }, [question]);

  // Safety check
  if (!questionText) {
    return null;
  }

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ 
        delay: index * 0.1,
        type: "spring",
        stiffness: 300,
        damping: 20
      }}
      whileHover={{ 
        scale: 1.02,
        y: -2,
        transition: { type: "spring", stiffness: 400, damping: 25 }
      }}
      whileTap={{ scale: 0.96 }}
      onClick={() => onClick(questionText)}
      className={cn(
        "group relative flex items-start gap-2 px-3 py-2 rounded-lg border bg-white/50 backdrop-blur-sm shadow-sm transition-all duration-200",
        "min-h-[36px] text-left text-sm font-medium text-gray-600",
        "hover:bg-white/80 hover:shadow-md active:shadow-sm",
        "focus:outline-none focus:ring-1 focus:ring-blue-400 focus:ring-offset-1",
        getCategoryColor(question?.category).replace('border-', 'border-').replace('hover:border-', 'hover:border-').replace('hover:bg-', 'hover:bg-'),
        className
      )}
      title={questionText} // Full question on hover
    >
      {/* Category icon */}
      <motion.div 
        className="flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity mt-0.5"
        whileHover={{ rotate: 15 }}
        transition={{ type: "spring", stiffness: 300 }}
      >
        {getCategoryIcon(question?.category)}
      </motion.div>
      
      {/* Question text */}
      <span className="flex-1 text-left whitespace-normal break-words">
        {questionText}
      </span>
      
      {/* Confidence indicators */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {question?.confidence && question.confidence > 0.8 && (
          <motion.div 
            className="w-2 h-2 rounded-full bg-green-500 opacity-60" 
            title="High confidence question"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, delay: 0.2 + index * 0.1 }}
          />
        )}
        {question?.groundingScore && question.groundingScore > 0.5 && (
          <motion.div 
            className="w-2 h-2 rounded-full bg-blue-500 opacity-60" 
            title="Well-grounded in source content"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, delay: 0.3 + index * 0.1 }}
          />
        )}
      </div>
      
      {/* Hover arrow indicator */}
      <motion.div
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        initial={{ x: -5 }}
        whileHover={{ x: 0 }}
        transition={{ type: "spring", stiffness: 300 }}
      >
        <ArrowRight size={12} className="text-gray-400" />
      </motion.div>
      
      {/* Subtle gradient overlay on hover */}
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white to-transparent opacity-0 pointer-events-none"
        whileHover={{ opacity: 0.1 }}
        transition={{ duration: 0.3 }}
      />
    </motion.button>
  );
};

export default SmartActionChip;