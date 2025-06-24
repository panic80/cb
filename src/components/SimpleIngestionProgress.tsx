import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Progress } from './ui/progress';
import { CheckCircle2, Circle, Loader2, AlertCircle, FileText, Split, Brain, Database } from 'lucide-react';
import { cn } from '../lib/utils';

interface IngestionStep {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  duration?: number;
}

interface SimpleIngestionProgressProps {
  isActive: boolean;
  onComplete?: () => void;
}

const STEPS: IngestionStep[] = [
  { id: 'loading', name: 'Loading document', duration: 3000 },
  { id: 'splitting', name: 'Splitting into chunks', duration: 4000 },
  { id: 'embedding', name: 'Generating embeddings', duration: 5000 },
  { id: 'storing', name: 'Storing in vector database', duration: 3000 },
];

const stepIcons: Record<string, React.ReactNode> = {
  loading: <FileText className="h-4 w-4" />,
  splitting: <Split className="h-4 w-4" />,
  embedding: <Brain className="h-4 w-4" />,
  storing: <Database className="h-4 w-4" />,
};

export default function SimpleIngestionProgress({ isActive, onComplete }: SimpleIngestionProgressProps) {
  const [steps, setSteps] = useState<IngestionStep[]>(STEPS.map(s => ({ ...s, status: 'pending' })));
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [overallProgress, setOverallProgress] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);

  useEffect(() => {
    if (!isActive) {
      // Reset when not active
      setSteps(STEPS.map(s => ({ ...s, status: 'pending' })));
      setCurrentStepIndex(-1);
      setOverallProgress(0);
      setStepProgress(0);
      return;
    }

    // Start the first step
    setCurrentStepIndex(0);
  }, [isActive]);

  useEffect(() => {
    if (!isActive || currentStepIndex < 0 || currentStepIndex >= steps.length) return;

    const currentStep = steps[currentStepIndex];
    const duration = currentStep.duration || 3000;
    const progressInterval = 100; // Update every 100ms

    // Mark current step as in progress
    setSteps(prev => prev.map((s, i) => 
      i === currentStepIndex ? { ...s, status: 'in_progress' } : s
    ));

    // Animate step progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += (progressInterval / duration) * 100;
      if (progress > 100) progress = 100;
      
      setStepProgress(progress);
      
      // Update overall progress
      const completedSteps = currentStepIndex;
      const currentStepContribution = progress / 100;
      const overall = ((completedSteps + currentStepContribution) / steps.length) * 100;
      setOverallProgress(overall);

      if (progress >= 100) {
        clearInterval(interval);
        
        // Mark step as completed
        setSteps(prev => prev.map((s, i) => 
          i === currentStepIndex ? { ...s, status: 'completed' } : s
        ));

        // Move to next step
        if (currentStepIndex < steps.length - 1) {
          setTimeout(() => {
            setCurrentStepIndex(currentStepIndex + 1);
            setStepProgress(0);
          }, 500);
        } else {
          // All steps completed
          setTimeout(() => {
            if (onComplete) onComplete();
          }, 1000);
        }
      }
    }, progressInterval);

    return () => clearInterval(interval);
  }, [currentStepIndex, isActive, steps.length, onComplete]);

  const getStepIcon = (step: IngestionStep) => {
    if (step.status === 'completed') {
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    } else if (step.status === 'in_progress') {
      return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
    } else if (step.status === 'error') {
      return <AlertCircle className="h-4 w-4 text-red-600" />;
    } else {
      return <Circle className="h-4 w-4 text-gray-400" />;
    }
  };

  if (!isActive) return null;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">Ingestion Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Overall Progress</span>
            <span>{Math.round(overallProgress)}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>

        {/* Individual steps */}
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={step.id} className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{getStepIcon(step)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={cn(
                      "text-sm font-medium",
                      step.status === 'completed' && "text-green-600",
                      step.status === 'error' && "text-red-600",
                      step.status === 'in_progress' && "text-blue-600"
                    )}>
                      {step.name}
                    </p>
                  </div>
                  
                  {step.status === 'in_progress' && (
                    <Progress 
                      value={stepProgress} 
                      className="h-1 mt-2" 
                    />
                  )}
                </div>
                <div className="text-muted-foreground">
                  {stepIcons[step.id]}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Completion message */}
        {overallProgress === 100 && (
          <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-sm text-green-600 dark:text-green-400">
              Document successfully ingested!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}