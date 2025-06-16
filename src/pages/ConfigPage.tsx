import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
// Temporary toast implementation to avoid sonner issues
const toast = {
  success: (message: string) => console.log('✅ Success:', message),
  error: (message: string) => console.error('❌ Error:', message),
};
import { Upload, Link, Database, Trash2, RefreshCw, CheckCircle, XCircle, Clock, Brain, ArrowLeft, Terminal, X } from 'lucide-react';

interface RAGSource {
  id: string;
  type: 'url' | 'file';
  name: string;
  source: string;
  status: 'processing' | 'completed' | 'error';
  vectorCount?: number;
  ingestedAt: string;
  error?: string;
}

interface RAGStatus {
  totalVectors: number;
  totalSources: number;
  averageQueryTime: number;
  storageUsed: string;
  isHealthy: boolean;
  lastUpdate: string;
}

import { LLM_MODELS, type LLMModel, DEFAULT_MODEL_ID } from '../constants/models';

// Ensure LLM_MODELS is always an array
const MODELS = Array.isArray(LLM_MODELS) ? LLM_MODELS : [];

export default function ConfigPage() {
  const [activeTab, setActiveTab] = useState('ingestion');
  const [isLoading, setIsLoading] = useState(false);
  const [sources, setSources] = useState<RAGSource[]>([]);
  const [ragStatus, setRAGStatus] = useState<RAGStatus | null>(null);
  
  // URL Ingestion state
  const [urlInput, setUrlInput] = useState('');
  const [isIngestingUrl, setIsIngestingUrl] = useState(false);
  const [enableCrawling, setEnableCrawling] = useState(true);
  const [maxDepth, setMaxDepth] = useState<number>(1);
  const [maxPages, setMaxPages] = useState<number>(10);
  const [followExternalLinks, setFollowExternalLinks] = useState(false);
  const [ingestionProgress, setIngestionProgress] = useState(0);
  const [ingestionLogs, setIngestionLogs] = useState<string[]>([]);
  const [showIngestionConsole, setShowIngestionConsole] = useState(false);
  
  // File Upload state
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  
  // LLM Model state
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL_ID);
  const [selectedProvider, setSelectedProvider] = useState<'openai' | 'google' | 'anthropic'>('openai');
  const [tempSelectedModel, setTempSelectedModel] = useState<string>(DEFAULT_MODEL_ID);
  const [tempSelectedProvider, setTempSelectedProvider] = useState<'openai' | 'google' | 'anthropic'>('openai');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Load initial data
  useEffect(() => {
    loadRAGStatus();
    loadSources();
    loadModelSettings();
  }, []);

  // Auto-hide console after successful ingestion
  useEffect(() => {
    if (ingestionProgress === 100 && !isIngestingUrl) {
      const timer = setTimeout(() => {
        setShowIngestionConsole(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [ingestionProgress, isIngestingUrl]);

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

  const loadRAGStatus = async () => {
    try {
      const response = await fetch('/api/rag/status');
      if (response.ok) {
        const data = await response.json();
        
        // Transform the data to match the expected RAGStatus interface
        const transformedStatus: RAGStatus = {
          totalVectors: data.document_count || 0,
          totalSources: data.document_count || 0, // Use document count as source count
          averageQueryTime: 0, // Not provided by the API
          storageUsed: 'In-Memory', // Based on vector_store_type
          isHealthy: data.status === 'healthy',
          lastUpdate: new Date().toISOString()
        };
        
        setRAGStatus(transformedStatus);
      }
    } catch (error) {
      console.error('Failed to load RAG status:', error);
    }
  };

  const loadSources = async () => {
    try {
      const response = await fetch('/api/rag/sources');
      if (response.ok) {
        const data = await response.json();
        // Handle the response structure from RAG service
        const sourcesArray = data.sources || data || [];
        
        // Transform the data to match the expected RAGSource interface
        const transformedSources = (sourcesArray || []).map((source: any) => ({
          id: source.id,
          type: source.source?.startsWith('http') ? 'url' : 'file',
          name: source.title || source.source || 'Unknown',
          source: source.source || '',
          status: 'completed', // RAG service doesn't return status, assume completed
          vectorCount: source.chunk_count || 0,
          ingestedAt: source.created_at || new Date().toISOString(),
        }));
        
        setSources(transformedSources);
      } else {
        console.warn('Failed to load sources, status:', response.status);
        setSources([]);
      }
    } catch (error) {
      console.error('Failed to load sources:', error);
      setSources([]); // Set to empty array on error
    }
  };

  const addIngestionLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    setIngestionLogs(prev => [...prev, logEntry]);
  };

  const handleUrlIngestion = async () => {
    if (!urlInput.trim()) {
      toast.error('Please enter a valid URL');
      return;
    }

    // Reset state
    setIsIngestingUrl(true);
    setIngestionProgress(0);
    setIngestionLogs([]);
    setShowIngestionConsole(true);

    try {
      addIngestionLog(`🚀 Starting URL ingestion for: ${urlInput.trim()}`);
      setIngestionProgress(10);

      addIngestionLog('📡 Sending request to RAG service...');
      setIngestionProgress(20);

      const requestBody = {
        url: urlInput.trim(),
        enable_crawling: enableCrawling,
        max_depth: enableCrawling ? maxDepth : 0,
        max_pages: enableCrawling ? maxPages : 1,
        follow_external_links: enableCrawling ? followExternalLinks : false
      };

      addIngestionLog(`🔧 Crawling settings: depth=${requestBody.max_depth}, pages=${requestBody.max_pages}, external=${requestBody.follow_external_links}`);

      const response = await fetch('/api/rag/ingest/url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      addIngestionLog('📥 Response received from server');
      setIngestionProgress(40);

      if (response.ok) {
        const result = await response.json();
        addIngestionLog('✅ URL ingestion started successfully');
        setIngestionProgress(60);

        // Handle the response structure
        const data = result.data || result;
        addIngestionLog(`📊 Source ID: ${data.id || data.source_id || 'N/A'}`);
        addIngestionLog(`🔢 Documents created: ${data.document_count || data.vectors_created || 'N/A'}`);
        setIngestionProgress(80);

        addIngestionLog('🔄 Refreshing sources and status...');
        await Promise.all([loadSources(), loadRAGStatus()]);
        setIngestionProgress(100);

        addIngestionLog('🎉 Ingestion completed successfully!');
        toast.success('URL ingestion completed successfully');
        setUrlInput('');
      } else {
        const error = await response.json();
        addIngestionLog(`❌ Error: ${error.message || 'Failed to ingest URL'}`);
        toast.error(error.message || 'Failed to ingest URL');
      }
    } catch (error) {
      addIngestionLog(`💥 Network error: ${error.message}`);
      toast.error('Network error occurred');
    } finally {
      setIsIngestingUrl(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    console.log('📁 File upload started:', {
      name: file.name,
      type: file.type,
      size: file.size
    });

    const maxSize = 50 * 1024 * 1024; // 50MB
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'application/pdf',
      'text/html',
      'application/json'
    ];

    if (file.size > maxSize) {
      console.log('❌ File too large:', file.size, 'bytes (max:', maxSize, 'bytes)');
      toast.error(`File size must be less than 50MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB`);
      return;
    }

    if (!allowedTypes.includes(file.type)) {
      console.log('❌ Unsupported file type:', file.type);
      toast.error('Unsupported file type. Please use TXT, MD, PDF, HTML, or JSON files.');
      return;
    }

    console.log('✅ File validation passed');
    setIsUploading(true);
    setUploadProgress(10);

    try {
      // Convert file to base64 using FileReader (more reliable for large files)
      const base64Content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix (e.g., "data:application/pdf;base64,")
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      console.log('📄 Base64 conversion complete, length:', base64Content.length);
      setUploadProgress(30);

      // Prepare request data matching backend expectations
      const requestData = {
        filename: file.name,
        mimetype: file.type,
        content_type: file.type,  // Include both field names for compatibility
        content: base64Content,
        size: file.size
      };

      console.log('📤 Sending request to backend...', {
        filename: requestData.filename,
        mimetype: requestData.mimetype,
        size: requestData.size,
        contentLength: requestData.content.length
      });

      setUploadProgress(50);

      const response = await fetch('/api/rag/ingest/file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      console.log('📥 Response received:', response.status, response.statusText);
      setUploadProgress(80);

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Upload successful:', result);
        setUploadProgress(100);
        
        // Handle the response structure
        const data = result.data || result;
        const details = data.processing_details || {};
        let successMessage = `File uploaded successfully! Created ${data.document_count || data.vectors_created || 0} chunks.`;
        
        if (details.pdf_pages) {
          successMessage += ` PDF has ${details.pdf_pages} pages.`;
        }
        if (details.tables_found > 0) {
          successMessage += ` Found ${details.tables_found} tables.`;
        }
        
        toast.success(successMessage);
        loadSources();
        loadRAGStatus();
      } else {
        const error = await response.json();
        console.error('❌ Upload failed:', error);
        toast.error(error.detail || error.message || 'Failed to upload file');
      }
    } catch (error) {
      console.error('💥 File upload error:', error);
      toast.error('Failed to process file. Please try again.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    try {
      const response = await fetch('/api/rag/sources/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: sourceId }),
      });

      if (response.ok) {
        toast.success('Source deleted successfully');
        loadSources();
        loadRAGStatus();
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to delete source');
      }
    } catch (error) {
      toast.error('Network error occurred');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'processing':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
          <h1 className="text-3xl font-bold text-foreground mb-2">RAG Configuration</h1>
          <p className="text-muted-foreground">
            Manage your knowledge base by ingesting URLs and files, and monitor system status.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="model" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              LLM Model
            </TabsTrigger>
            <TabsTrigger value="ingestion" className="flex items-center gap-2">
              <Link className="h-4 w-4" />
              URL Ingestion
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              File Upload
            </TabsTrigger>
            <TabsTrigger value="status" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              RAG Status
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
                  Add web content to your knowledge base by providing URLs. The system will crawl and process the content.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter URL (e.g., https://example.com/article)"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleUrlIngestion()}
                    disabled={isIngestingUrl}
                  />
                  <Button
                    onClick={handleUrlIngestion}
                    disabled={isIngestingUrl || !urlInput.trim()}
                  >
                    {isIngestingUrl ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Ingesting...
                      </>
                    ) : (
                      <>
                        <Link className="h-4 w-4 mr-2" />
                        Ingest URL
                      </>
                    )}
                  </Button>
                </div>

                {/* Crawling Options */}
                <div className="p-4 border rounded-lg space-y-4 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium">Web Crawling Options</h4>
                      <p className="text-xs text-muted-foreground">Configure how links should be followed</p>
                    </div>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={enableCrawling}
                        onChange={(e) => setEnableCrawling(e.target.checked)}
                        disabled={isIngestingUrl}
                        className="rounded"
                      />
                      <span className="text-sm">Enable crawling</span>
                    </label>
                  </div>

                  {enableCrawling && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium mb-1">Max Depth</label>
                        <Select
                          value={maxDepth.toString()}
                          onValueChange={(value) => setMaxDepth(parseInt(value))}
                          disabled={isIngestingUrl}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">0 (Single page only)</SelectItem>
                            <SelectItem value="1">1 (One level deep)</SelectItem>
                            <SelectItem value="2">2 (Two levels deep)</SelectItem>
                            <SelectItem value="3">3 (Three levels deep)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">How many link levels to follow</p>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-1">Max Pages</label>
                        <Select
                          value={maxPages.toString()}
                          onValueChange={(value) => setMaxPages(parseInt(value))}
                          disabled={isIngestingUrl}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="5">5 pages</SelectItem>
                            <SelectItem value="10">10 pages</SelectItem>
                            <SelectItem value="25">25 pages</SelectItem>
                            <SelectItem value="50">50 pages</SelectItem>
                            <SelectItem value="100">100 pages</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">Maximum pages to crawl</p>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-1">External Links</label>
                        <div className="flex items-center space-x-2 h-8">
                          <input
                            type="checkbox"
                            checked={followExternalLinks}
                            onChange={(e) => setFollowExternalLinks(e.target.checked)}
                            disabled={isIngestingUrl}
                            className="rounded"
                          />
                          <span className="text-xs">Follow external domains</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Include links to other websites</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="text-sm text-muted-foreground">
                  Supported: Web pages, documentation sites, articles, and other text-based content.
                </div>
                
                {/* Progress Bar */}
                {isIngestingUrl && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Ingestion Progress</span>
                      <span>{ingestionProgress}%</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${ingestionProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Console Window */}
            {showIngestionConsole && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-4 w-4" />
                      <CardTitle className="text-base">Ingestion Console</CardTitle>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowIngestionConsole(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-black text-green-400 font-mono text-xs p-4 rounded-lg h-48 overflow-y-auto">
                    {ingestionLogs.length === 0 ? (
                      <div className="text-gray-500">Console output will appear here...</div>
                    ) : (
                      (ingestionLogs || []).map((log, index) => (
                        <div key={index} className="mb-1">
                          {log}
                        </div>
                      ))
                    )}
                    {isIngestingUrl && (
                      <div className="flex items-center gap-1 mt-2">
                        <div className="w-1 h-3 bg-green-400 animate-pulse" />
                        <span className="text-gray-400">Processing...</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="upload" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>File Upload</CardTitle>
                <CardDescription>
                  Upload documents directly to your knowledge base. Drag and drop files or click to browse.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragActive
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  {isUploading ? (
                    <div className="space-y-4">
                      <RefreshCw className="h-8 w-8 mx-auto animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Uploading and processing file...</p>
                      {uploadProgress > 0 && (
                        <div className="w-full bg-secondary rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Drop files here or click to browse</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Supports: TXT, MD, PDF, HTML, JSON (max 50MB)
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => {
                          console.log('🖱️ Browse files button clicked');
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = '.txt,.md,.pdf,.html,.json';
                          input.onchange = (e) => {
                            console.log('📁 File selected from dialog');
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) {
                              console.log('📂 Processing selected file:', file.name);
                              handleFileUpload(file);
                            } else {
                              console.log('❌ No file selected');
                            }
                          };
                          input.click();
                        }}
                      >
                        Browse Files
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="status" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total Vectors</p>
                      <p className="text-2xl font-bold">{ragStatus?.totalVectors || 0}</p>
                    </div>
                    <Database className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Sources</p>
                      <p className="text-2xl font-bold">{sources?.length || 0}</p>
                    </div>
                    <Link className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Avg Query Time</p>
                      <p className="text-2xl font-bold">{ragStatus?.averageQueryTime || 0}ms</p>
                    </div>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">System Status</p>
                      <Badge variant={ragStatus?.isHealthy ? 'default' : 'destructive'}>
                        {ragStatus?.isHealthy ? 'Healthy' : 'Unhealthy'}
                      </Badge>
                    </div>
                    {ragStatus?.isHealthy ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Ingested Sources</CardTitle>
                    <CardDescription>
                      All content currently indexed in your knowledge base
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { loadSources(); loadRAGStatus(); }}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!sources || sources.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No sources ingested yet.</p>
                    <p className="text-sm">Use the URL Ingestion or File Upload tabs to add content.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Vectors</TableHead>
                        <TableHead>Ingested</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Array.isArray(sources) && sources.map((source) => (
                        <TableRow key={source.id}>
                          <TableCell className="font-medium">
                            <div className="max-w-xs truncate" title={source.name}>
                              {source.name}
                            </div>
                            {source.error && (
                              <div className="text-xs text-red-500 mt-1" title={source.error}>
                                Error: {source.error}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {source.type === 'url' ? 'URL' : 'File'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(source.status)}
                              <span className="capitalize">{source.status}</span>
                            </div>
                          </TableCell>
                          <TableCell>{source.vectorCount || 0}</TableCell>
                          <TableCell>{formatDate(source.ingestedAt)}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteSource(source.id)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}