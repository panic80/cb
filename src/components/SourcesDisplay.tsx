import React from 'react';
import './SourcesDisplay.css';

interface Source {
  title: string;
  excerpt: string;
  url: string;
}

interface SourcesDisplayProps {
  sources: Source[];
}

export const SourcesDisplay: React.FC<SourcesDisplayProps> = ({ sources }) => {
  const getDomain = (url: string) => {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return domain;
    } catch {
      return 'Source';
    }
  };

  const truncateExcerpt = (text: string, maxLength: number = 150) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  };

  if (!sources || sources.length === 0) return null;

  return (
    <div className="sources-container">
      <h3 className="sources-header">Sources</h3>
      <div className="sources-list">
        {sources.map((source, index) => (
          <div key={index} className="source-item">
            <div className="source-number">{index + 1}</div>
            <div className="source-content">
              <div className="source-domain">{getDomain(source.url)}</div>
              <p className="source-excerpt">{truncateExcerpt(source.excerpt)}</p>
              <a 
                href={source.url} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="source-link"
                aria-label={`View full source from ${getDomain(source.url)}`}
              >
                View full source →
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};