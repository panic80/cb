import React from 'react';
import { useLoading, LoadingStage, getStagePercentage } from '../context/LoadingContext';
import './LoadingScreen.css';

interface StageIndicatorProps {
  currentStage: LoadingStage;
  stage: LoadingStage;
}

const StageIndicator: React.FC<StageIndicatorProps> = ({ currentStage, stage }) => {
  const getStatus = () => {
    const stages: LoadingStage[] = ['url-scanning', 'parsing', 'validation', 'complete'];
    const currentIndex = stages.indexOf(currentStage);
    const stageIndex = stages.indexOf(stage);

    if (currentStage === 'error') return '';
    if (stageIndex < currentIndex) return 'completed';
    if (stageIndex === currentIndex) return 'active';
    return '';
  };

  return (
    <div className={`stage-indicator ${getStatus()}`}
         title={stage.charAt(0).toUpperCase() + stage.slice(1)} />
  );
};

const LoadingScreen: React.FC = () => {
  const { state, dispatch } = useLoading();

  const handleRetry = () => {
    dispatch({ type: 'RESET' });
    // Trigger retry event
    window.dispatchEvent(new CustomEvent('retryUrlParsing'));
  };

  if (!state.isLoading) return null;

  return (
    <div className="loading-screen">
      <div className="loading-content">
        <h2 className="loading-title">Processing URL</h2>
        <p className="loading-message">{state.message}</p>
        
        <div className="loading-bar">
          <div
            className="loading-bar-fill"
            style={{ width: `${state.progress}%` }}
          />
        </div>

        <div className="loading-stage">
          <StageIndicator currentStage={state.stage} stage="url-scanning" />
          <StageIndicator currentStage={state.stage} stage="parsing" />
          <StageIndicator currentStage={state.stage} stage="validation" />
          <StageIndicator currentStage={state.stage} stage="complete" />
        </div>

        {state.error && (
          <>
            <p className="loading-error">{state.error}</p>
            <button className="retry-button" onClick={handleRetry}>
              Retry
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default LoadingScreen;