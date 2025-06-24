import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Progress } from './ui/progress';
import { CheckCircle2, Circle, Loader2, AlertCircle, FileText, Split, Brain, Database } from 'lucide-react';
import { cn } from '../lib/utils';

interface IngestionStep {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  message?: string;
  progress?: number;
  startTime?: number;
  endTime?: number;
  details?: {
    current?: number;
    total?: number;
    rate?: number;
  };
}

interface IngestionProgressProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  operationId?: string;
}

const stepIcons: Record<string, React.ReactNode> = {
  loading: <FileText className="h-4 w-4" />,
  splitting: <Split className="h-4 w-4" />,
  embedding: <Brain className="h-4 w-4" />,
  storing: <Database className="h-4 w-4" />,
};

export default function IngestionProgress({ isOpen, onClose, url, operationId }: IngestionProgressProps) {
  const [steps, setSteps] = useState<IngestionStep[]>([
    { id: 'loading', name: 'Loading document', status: 'pending' },
    { id: 'splitting', name: 'Splitting into chunks', status: 'pending' },
    { id: 'embedding', name: 'Generating embeddings', status: 'pending' },
    { id: 'storing', name: 'Storing in vector database', status: 'pending' },
  ]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Connect to SSE endpoint for real-time updates
    const es = new EventSource(`/api/rag/ingest/progress?url=${encodeURIComponent(url)}`);
    setEventSource(es);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleProgressUpdate(data);
      } catch (err) {
        console.error('Failed to parse progress update:', err);
      }
    };

    es.onerror = (error) => {
      console.error('SSE error:', error);
      es.close();
      setError('Connection lost. Progress updates unavailable.');
    };

    return () => {
      es.close();
    };
  }, [isOpen, url]);

  const handleProgressUpdate = (data: any) => {
    switch (data.type) {
      case 'step_start':
        setSteps(prev => prev.map(step => 
          step.id === data.stepId 
            ? { ...step, status: 'in_progress', startTime: Date.now(), message: data.message }
            : step
        ));
        break;

      case 'step_progress':
        setSteps(prev => prev.map(step => 
          step.id === data.stepId 
            ? { 
                ...step, 
                progress: data.progress, 
                message: data.message,
                details: data.details 
              }
            : step
        ));
        break;

      case 'step_complete':
        setSteps(prev => prev.map(step => 
          step.id === data.stepId 
            ? { 
                ...step, 
                status: 'completed', 
                endTime: Date.now(),
                message: data.message,
                progress: 100 
              }
            : step
        ));
        break;

      case 'step_error':
        setSteps(prev => prev.map(step => 
          step.id === data.stepId 
            ? { ...step, status: 'error', message: data.message }
            : step
        ));
        setError(data.message);
        break;

      case 'overall_progress':
        setOverallProgress(data.progress);
        break;

      case 'complete':
        setIsComplete(true);
        setOverallProgress(100);
        eventSource?.close();
        break;

      case 'error':
        setError(data.message);
        eventSource?.close();
        break;
    }
  };

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

  const formatDuration = (startTime?: number, endTime?: number) => {
    if (!startTime) return '';
    const end = endTime || Date.now();
    const duration = (end - startTime) / 1000;
    return `${duration.toFixed(1)}s`;
  };

  const formatRate = (rate?: number, unit: string = 'items/s') => {
    if (!rate) return '';
    return `${rate.toFixed(1)} ${unit}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Document Ingestion Progress</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* URL being processed */}
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm font-medium">Processing URL:</p>
            <p className="text-xs text-muted-foreground truncate">{url}</p>
          </div>

          {/* Overall progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Overall Progress</span>
              <span>{overallProgress}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>

          {/* Individual steps */}
          <div className="space-y-3">
            {steps.map((step) => (
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
                      {step.startTime && (
                        <span className="text-xs text-muted-foreground">
                          {formatDuration(step.startTime, step.endTime)}
                        </span>
                      )}
                    </div>
                    
                    {step.message && (
                      <p className="text-xs text-muted-foreground mt-1">{step.message}</p>
                    )}
                    
                    {step.details && (
                      <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                        {step.details.current !== undefined && step.details.total !== undefined && (
                          <span>{step.details.current} / {step.details.total}</span>
                        )}
                        {step.details.rate !== undefined && (
                          <span>{formatRate(step.details.rate, 
                            step.id === 'embedding' ? 'embeddings/s' : 
                            step.id === 'splitting' ? 'chunks/s' : 
                            'docs/s'
                          )}</span>
                        )}
                      </div>
                    )}
                    
                    {step.status === 'in_progress' && step.progress !== undefined && (
                      <Progress value={step.progress} className="h-1 mt-2" />
                    )}
                  </div>
                  <div className="text-muted-foreground">
                    {stepIcons[step.id]}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Success message */}
          {isComplete && !error && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm text-green-600 dark:text-green-400">
                Document successfully ingested!
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}