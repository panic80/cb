import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { toast } from 'sonner';
import { Brain, ArrowLeft, CheckCircle, Globe, Loader2, Trash2, AlertTriangle, RefreshCw } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../components/ui/alert-dialog';
import IngestionConsole from '../components/IngestionConsole';

import { LLM_MODELS, type LLMModel, DEFAULT_MODEL_ID } from '../constants/models';

// Ensure LLM_MODELS is always an array
const MODELS = Array.isArray(LLM_MODELS) ? LLM_MODELS : [];

export default function ConfigPage() {
  const [activeTab, setActiveTab] = useState('model');
  
  // LLM Model state
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL_ID);
  const [selectedProvider, setSelectedProvider] = useState<'openai' | 'google' | 'anthropic'>('openai');
  const [tempSelectedModel, setTempSelectedModel] = useState<string>(DEFAULT_MODEL_ID);
  const [tempSelectedProvider, setTempSelectedProvider] = useState<'openai' | 'google' | 'anthropic'>('openai');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // URL Ingestion state
  const [urlInput, setUrlInput] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [ingestionHistory, setIngestionHistory] = useState<Array<{url: string, status: string, timestamp: string}>>([]);
  const [showIngestionProgress, setShowIngestionProgress] = useState(false);
  const [currentIngestionUrl, setCurrentIngestionUrl] = useState('');
  
  // Database management state
  const [isPurging, setIsPurging] = useState(false);
  const [databaseStats, setDatabaseStats] = useState<{
    total_documents: number;
    total_chunks: number;
    sources: Array<{
      source: string;
      document_count: number;
      chunk_count: number;
      last_updated: string;
    }>;
  } | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Load initial data
  useEffect(() => {
    loadModelSettings();
    loadIngestionHistory();
  }, []);

  // Load database stats when database tab is active
  useEffect(() => {
    if (activeTab === 'database') {
      loadDatabaseStats();
    }
  }, [activeTab]);

  const loadModelSettings = () => {
    // Load saved model from localStorage
    const savedModel = localStorage.getItem('selectedLLMModel');
    const savedProvider = localStorage.getItem('selectedLLMProvider');
    
    if (savedModel) {
      setSelectedModel(savedModel);
      setTempSelectedModel(savedModel);
    }
    if (savedProvider) {
      setSelectedProvider(savedProvider as 'openai' | 'google' | 'anthropic');
      setTempSelectedProvider(savedProvider as 'openai' | 'google' | 'anthropic');
    }
  };

  const handleModelChange = (modelId: string) => {
    const model = MODELS.find(m => m.id === modelId);
    if (model) {
      setTempSelectedModel(modelId);
      setTempSelectedProvider(model.provider);
      
      // Check if changes were made
      const hasChanges = modelId !== selectedModel || model.provider !== selectedProvider;
      setHasUnsavedChanges(hasChanges);
    }
  };

  const handleSaveModel = () => {
    const model = MODELS.find(m => m.id === tempSelectedModel);
    if (model) {
      // Update the actual state
      setSelectedModel(tempSelectedModel);
      setSelectedProvider(tempSelectedProvider);
      
      // Save to localStorage
      localStorage.setItem('selectedLLMModel', tempSelectedModel);
      localStorage.setItem('selectedLLMProvider', tempSelectedProvider);
      
      // Reset unsaved changes
      setHasUnsavedChanges(false);
      
      toast.success(`Model saved: ${model.name}`);
    }
  };

  const handleResetModel = () => {
    setTempSelectedModel(selectedModel);
    setTempSelectedProvider(selectedProvider);
    setHasUnsavedChanges(false);
  };

  const loadIngestionHistory = () => {
    const savedHistory = localStorage.getItem('ingestionHistory');
    if (savedHistory) {
      try {
        setIngestionHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Error loading ingestion history:', e);
      }
    }
  };

  const loadDatabaseStats = async () => {
    setIsLoadingStats(true);
    try {
      // Try to get stats from the stats endpoint first
      const statsResponse = await fetch('/api/v2/sources/stats');
      if (statsResponse.ok) {
        const data = await statsResponse.json();
        // Check if we got valid data
        if (data && (data.total_documents !== undefined || data.error)) {
          // Even if there's an error, we might have partial data
          setDatabaseStats({
            total_documents: data.total_documents || 0,
            total_chunks: data.total_chunks || 0,
            sources: data.sources || []
          });
          return;
        }
      }
      
      // Fallback: Try the simple count endpoint
      const countResponse = await fetch('/api/v2/sources/count');
      if (countResponse.ok) {
        const countData = await countResponse.json();
        setDatabaseStats({
          total_documents: countData.count || 0,
          total_chunks: countData.count || 0,
          sources: []
        });
        return;
      }
      
      // Final fallback: Get basic info from health endpoint
      const healthResponse = await fetch('/health?checkRag=true');
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        if (healthData.ragService && healthData.ragService.components) {
          const vectorStore = healthData.ragService.components.vector_store;
          // Create a simplified stats object from health data
          setDatabaseStats({
            total_documents: vectorStore.document_count || 0,
            total_chunks: vectorStore.document_count || 0, // Approximate
            sources: [] // Health endpoint doesn't provide source breakdown
          });
        } else {
          // Set empty stats instead of throwing
          setDatabaseStats({
            total_documents: 0,
            total_chunks: 0,
            sources: []
          });
        }
      } else {
        // Set empty stats if all fails
        setDatabaseStats({
          total_documents: 0,
          total_chunks: 0,
          sources: []
        });
      }
    } catch (error) {
      console.error('Error loading database stats:', error);
      // Don't show error toast for initial load, just set empty stats
      setDatabaseStats({
        total_documents: 0,
        total_chunks: 0,
        sources: []
      });
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handlePurgeDatabase = async () => {
    setIsPurging(true);
    
    try {
      const response = await fetch('/api/v2/database/purge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      if (response.ok) {
        toast.success('Database purged successfully');
        // Clear ingestion history as well
        setIngestionHistory([]);
        localStorage.removeItem('ingestionHistory');
        // Reload database stats
        await loadDatabaseStats();
      } else {
        toast.error(data.message || 'Failed to purge database');
      }
    } catch (error) {
      console.error('Database purge error:', error);
      toast.error('Network error during database purge');
    } finally {
      setIsPurging(false);
    }
  };

  const handleIngestURL = async () => {
    if (!urlInput.trim()) {
      toast.error('Please enter a URL');
      return;
    }

    // Validate URL
    try {
      new URL(urlInput);
    } catch {
      toast.error('Please enter a valid URL');
      return;
    }

    setIsIngesting(true);
    setShowIngestionProgress(true);
    setCurrentIngestionUrl(urlInput);
    
    try {
      const response = await fetch('/api/rag/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: urlInput,
          type: 'web',
          forceRefresh: forceRefresh,
          metadata: {
            source: 'manual_ingestion',
            ingested_from: 'config_page'
          }
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        if (data.status === 'success') {
          toast.success(`Successfully ingested ${data.chunks_created} chunks from URL`);
        } else if (data.status === 'exists') {
          toast.info('Document already exists in the database. Use force refresh to re-ingest.');
        }
        
        // Add to history
        const newEntry = {
          url: urlInput,
          status: data.status === 'exists' ? 'exists' : 'success',
          timestamp: new Date().toISOString()
        };
        const updatedHistory = [newEntry, ...ingestionHistory].slice(0, 10); // Keep last 10
        setIngestionHistory(updatedHistory);
        localStorage.setItem('ingestionHistory', JSON.stringify(updatedHistory));
        
        // Clear input and reset force refresh
        setUrlInput('');
        setForceRefresh(false);
        
        // Reload database stats if on database tab
        if (activeTab === 'database') {
          loadDatabaseStats();
        }
      } else {
        const errorMessage = data.message || 'Failed to ingest URL';
        toast.error(errorMessage);
        
        // Add failed entry to history
        const newEntry = {
          url: urlInput,
          status: 'failed',
          timestamp: new Date().toISOString()
        };
        const updatedHistory = [newEntry, ...ingestionHistory].slice(0, 10);
        setIngestionHistory(updatedHistory);
        localStorage.setItem('ingestionHistory', JSON.stringify(updatedHistory));
      }
    } catch (error) {
      console.error('Ingestion error:', error);
      toast.error('Network error during ingestion');
    } finally {
      setIsIngesting(false);
      // Progress will auto-hide after completion
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => window.location.href = '/chat'}
              className="flex items-center gap-2 hover:bg-muted"
            >
              <ArrowLeft size={16} />
              Back to Chat
            </Button>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Configuration</h1>
          <p className="text-muted-foreground">
            Configure your chat assistant settings.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="model" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              LLM Model
            </TabsTrigger>
            <TabsTrigger value="ingestion" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              URL Ingestion
            </TabsTrigger>
            <TabsTrigger value="database" className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              Database
            </TabsTrigger>
          </TabsList>

          <TabsContent value="model" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>LLM Model Selection</CardTitle>
                <CardDescription>
                  Choose your preferred AI model for the chat assistant. Different models offer varying capabilities and performance.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Provider Tabs */}
                <Tabs value={tempSelectedProvider} onValueChange={(value) => {
                  setTempSelectedProvider(value as 'openai' | 'google' | 'anthropic');
                  // Check if changes were made
                  const hasChanges = value !== selectedProvider || tempSelectedModel !== selectedModel;
                  setHasUnsavedChanges(hasChanges);
                }}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="openai">OpenAI</TabsTrigger>
                    <TabsTrigger value="google">Google</TabsTrigger>
                    <TabsTrigger value="anthropic">Anthropic</TabsTrigger>
                  </TabsList>
                  
                  <div className="mt-4">
                    <div className="space-y-2">
                      {(MODELS || []).filter(model => model.provider === tempSelectedProvider).map((model) => (
                        <div
                          key={model.id}
                          className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                            tempSelectedModel === model.id
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50'
                          }`}
                          onClick={() => handleModelChange(model.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium">{model.name}</h4>
                              {model.description && (
                                <p className="text-sm text-muted-foreground mt-1">{model.description}</p>
                              )}
                            </div>
                            {tempSelectedModel === model.id && (
                              <CheckCircle className="h-5 w-5 text-primary" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Tabs>
                
                {/* Save/Reset buttons */}
                {hasUnsavedChanges && (
                  <div className="flex gap-2 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                        You have unsaved changes
                      </p>
                      <p className="text-xs text-yellow-600 dark:text-yellow-300">
                        Save your changes to apply the new model selection.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleResetModel}>
                        Reset
                      </Button>
                      <Button size="sm" onClick={handleSaveModel}>
                        Save Changes
                      </Button>
                    </div>
                  </div>
                )}
                
                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    <strong>Active Model:</strong> {MODELS.find(m => m.id === selectedModel)?.name || 'None selected'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Model ID: <code className="px-1 py-0.5 bg-background rounded">{selectedModel}</code>
                  </p>
                  {hasUnsavedChanges && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                      <strong>Selected:</strong> {MODELS.find(m => m.id === tempSelectedModel)?.name} (not saved)
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ingestion" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>URL Ingestion</CardTitle>
                <CardDescription>
                  Add external URLs to the knowledge base. The system will scrape and index the content for improved responses.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="url-input">Enter URL to Ingest</Label>
                    <div className="flex gap-2">
                      <Input
                        id="url-input"
                        type="url"
                        placeholder="https://example.com/document"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !isIngesting) {
                            handleIngestURL();
                          }
                        }}
                        disabled={isIngesting}
                      />
                      <Button
                        onClick={handleIngestURL}
                        disabled={isIngesting || !urlInput.trim()}
                      >
                        {isIngesting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Ingesting...
                          </>
                        ) : (
                          'Ingest URL'
                        )}
                      </Button>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="force-refresh"
                        checked={forceRefresh}
                        onCheckedChange={(checked) => setForceRefresh(checked as boolean)}
                      />
                      <Label
                        htmlFor="force-refresh"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Force refresh (re-ingest even if document already exists)
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      The content will be automatically processed and added to the RAG knowledge base.
                    </p>
                  </div>

                  {/* Ingestion Progress Console */}
                  {showIngestionProgress && currentIngestionUrl && (
                    <div className="mt-4">
                      <IngestionConsole
                        url={currentIngestionUrl}
                        onComplete={(success) => {
                          setShowIngestionProgress(false);
                          setCurrentIngestionUrl('');
                          // Reload database stats if on database tab
                          if (activeTab === 'database') {
                            loadDatabaseStats();
                          }
                        }}
                      />
                    </div>
                  )}

                  {ingestionHistory.length > 0 && !showIngestionProgress && (
                    <div className="space-y-2">
                      <Label>Recent Ingestions</Label>
                      <div className="space-y-2">
                        {ingestionHistory.map((entry, index) => (
                          <div
                            key={index}
                            className={`p-3 rounded-lg border ${
                              entry.status === 'success'
                                ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
                                : entry.status === 'exists'
                                ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'
                                : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{entry.url}</p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(entry.timestamp).toLocaleString()}
                                </p>
                              </div>
                              <span
                                className={`text-xs px-2 py-1 rounded ${
                                  entry.status === 'success'
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                    : entry.status === 'exists'
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                }`}
                              >
                                {entry.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="text-sm font-medium mb-2">Tips for URL Ingestion:</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Make sure the URL is publicly accessible</li>
                    <li>• The system will extract text content from web pages</li>
                    <li>• PDF documents and other file types may be supported depending on the URL</li>
                    <li>• Large documents will be split into smaller chunks for processing</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="database" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Database Management</CardTitle>
                <CardDescription>
                  Manage the RAG (Retrieval-Augmented Generation) vector database that stores indexed documents.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Database Statistics */}
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium">Database Statistics</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={loadDatabaseStats}
                        disabled={isLoadingStats}
                      >
                        <RefreshCw className={`h-4 w-4 ${isLoadingStats ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                    {isLoadingStats ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : databaseStats ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-3 bg-muted rounded-lg">
                            <p className="text-xs text-muted-foreground">Total Documents</p>
                            <p className="text-lg font-semibold">{databaseStats.total_documents}</p>
                          </div>
                          <div className="p-3 bg-muted rounded-lg">
                            <p className="text-xs text-muted-foreground">Total Chunks</p>
                            <p className="text-lg font-semibold">{databaseStats.total_chunks}</p>
                          </div>
                        </div>
                        
                        {databaseStats.sources && databaseStats.sources.length > 0 ? (
                          <div>
                            <p className="text-xs text-muted-foreground mb-2">Indexed Sources:</p>
                            <div className="space-y-2">
                              {databaseStats.sources.map((source, index) => (
                                <div key={index} className="p-2 bg-muted/50 rounded text-xs">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium truncate flex-1 mr-2">
                                      {source.source}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {source.document_count} docs, {source.chunk_count} chunks
                                    </span>
                                  </div>
                                  <p className="text-muted-foreground mt-1">
                                    Last updated: {new Date(source.last_updated).toLocaleString()}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : databaseStats.total_documents === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No documents indexed yet. Use the URL Ingestion tab to add content.
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            Source breakdown not available
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Unable to load database statistics
                      </p>
                    )}
                  </div>

                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                          Purge Database
                        </h4>
                        <p className="text-sm text-yellow-600 dark:text-yellow-300 mt-1">
                          This action will permanently delete all indexed documents from the vector database. 
                          You'll need to re-ingest any URLs or documents you want to use.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="text-sm font-medium">Clear Vector Database</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Remove all indexed documents and start fresh
                      </p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          disabled={isPurging}
                        >
                          {isPurging ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Purging...
                            </>
                          ) : (
                            <>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Purge Database
                            </>
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete all indexed documents 
                            from the vector database, including:
                            <ul className="mt-2 space-y-1 list-disc list-inside">
                              <li>All ingested URLs and their content</li>
                              <li>All document embeddings and metadata</li>
                              <li>All conversation history references</li>
                            </ul>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handlePurgeDatabase}
                            className="bg-red-600 hover:bg-red-700 text-white"
                          >
                            Yes, purge database
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="text-sm font-medium mb-2">Database Information:</h4>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li>• The database stores document embeddings for semantic search</li>
                      <li>• Purging will not affect your chat history</li>
                      <li>• You can re-ingest documents at any time</li>
                      <li>• The database uses ChromaDB for vector storage</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}