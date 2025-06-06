import React from 'react';

const APIPage: React.FC = () => {
  const endpoints = [
    {
      method: 'POST',
      path: '/api/gemini/generateContent',
      description: 'Generate AI content using Google Gemini',
      params: ['prompt', 'model', 'generationConfig']
    },
    {
      method: 'GET',
      path: '/api/travel-instructions',
      description: 'Retrieve Canadian Forces travel instructions',
      params: []
    },
    {
      method: 'GET',
      path: '/api/config',
      description: 'Get API configuration and available features',
      params: []
    },
    {
      method: 'GET',
      path: '/health',
      description: 'System health check and status',
      params: []
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-light text-gray-900 dark:text-white mb-4">
            API Documentation
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Simple and reliable endpoints for the Travel Instructions Chatbot
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-medium text-gray-900 dark:text-white">
              Available Endpoints
            </h2>
          </div>

          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {endpoints.map((endpoint, index) => (
              <div key={index} className="p-6">
                <div className="flex items-start space-x-4">
                  <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                    endpoint.method === 'GET' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                  }`}>
                    {endpoint.method}
                  </span>
                  <div className="flex-1">
                    <code className="text-sm font-mono text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                      {endpoint.path}
                    </code>
                    <p className="text-gray-600 dark:text-gray-300 mt-2">
                      {endpoint.description}
                    </p>
                    {endpoint.params.length > 0 && (
                      <div className="mt-3">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Parameters:
                        </span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {endpoint.params.map((param, i) => (
                            <code key={i} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                              {param}
                            </code>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Getting Started
          </h3>
          <div className="space-y-4 text-gray-600 dark:text-gray-300">
            <p>All endpoints return JSON responses with appropriate HTTP status codes.</p>
            <p>Rate limiting is enabled with a default of 60 requests per minute.</p>
            <p>For health monitoring, use the <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-sm">/health</code> endpoint.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default APIPage;