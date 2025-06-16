import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Settings, Copy, RefreshCw, Sparkles, Command as CommandIcon, ArrowLeft, Mic, Paperclip, Hash, AtSign, HelpCircle, Zap, ChevronDown, Volume2, X } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import SuggestionController from '@/components/SuggestionController';
import { useSuggestionVisibility } from '@/hooks/useSuggestionVisibility';
import { cn } from '@/lib/utils';
import { parseApiResponse } from '../utils/chatUtils';
import { getModelDisplayName, DEFAULT_MODEL_ID } from '../constants/models';
import { generateFollowUpQuestions } from '../services/followUpService';
import { Message, Source, FollowUpQuestion } from '@/types/chat';

/**
 * Format plain text response into markdown
 */
const formatPlainTextToMarkdown = (text: string): string => {
  let formatted = text;
  
  // Add main heading if the response starts with an item name
  if (formatted.match(/^[A-Z][a-z]+ is/)) {
    const firstPeriod = formatted.indexOf('.');
    if (firstPeriod > 0) {
      const title = formatted.substring(0, firstPeriod);
      formatted = `## ${title}\n\n${formatted.substring(firstPeriod + 1)}`;
    }
  }
  
  // Convert numbered sections (e.g., "1. Nature of Enigma") to headings
  formatted = formatted.replace(/(\d+)\.\s*([A-Z][^:]+)(?=[A-Z])/g, '\n\n### $2\n\n');
  
  // Convert bullet points patterns (e.g., "* Item:" or "• Item:")
  formatted = formatted.replace(/\*\s+([^:]+):/g, '\n• **$1:**');
  
  // Bold important terms followed by colons
  formatted = formatted.replace(/([A-Z][a-zA-Z\s]+):\s/g, '**$1:** ');
  
  // Add line breaks between major sections
  formatted = formatted.replace(/\.(\d+\.)/g, '.\n\n$1');
  
  // Ensure proper spacing after periods
  formatted = formatted.replace(/\.([A-Z])/g, '.\n\n$1');
  
  // Clean up excessive line breaks
  formatted = formatted.replace(/\n{3,}/g, '\n\n');
  
  return formatted.trim();
};

/**
 * Enhanced Chat page with modern UI/UX improvements
 */
const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [currentModel, setCurrentModel] = useState(getModelDisplayName(DEFAULT_MODEL_ID));
  const [showVoiceInput, setShowVoiceInput] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showInlineCommand, setShowInlineCommand] = useState(false);
  const [commandFilter, setCommandFilter] = useState('');
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Initialize suggestion visibility manager
  const suggestionManager = useSuggestionVisibility();
  
  // Motion values for interactive animations
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-300, 300], [15, -15]);
  const rotateY = useTransform(mouseX, [-300, 300], [-15, 15]);
  
  // Theme state matching the landing page
  const [theme, setTheme] = useState(() => {
    const storedTheme = localStorage.getItem('elite-chat-theme');
    if (storedTheme) return storedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  
  // Inline command suggestions
  const inlineCommands = [
    { icon: <Zap size={16} />, label: 'Quick response', command: '/quick', description: 'Get a concise answer' },
    { icon: <Hash size={16} />, label: 'Summarize', command: '/summarize', description: 'Summarize the conversation' },
    { icon: <AtSign size={16} />, label: 'Mention policy', command: '/policy', description: 'Reference specific policy' },
    { icon: <HelpCircle size={16} />, label: 'Explain', command: '/explain', description: 'Get detailed explanation' },
  ];

  // Apply theme changes to document
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  
  // Handle mouse movement for interactive effects
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      mouseX.set(clientX - centerX);
      mouseY.set(clientY - centerY);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  // Load initial model on component mount
  useEffect(() => {
    const selectedModel = localStorage.getItem('selectedLLMModel') || DEFAULT_MODEL_ID;
    const displayModel = getModelDisplayName(selectedModel);
    setCurrentModel(displayModel);
  }, []);

  // Toggle theme function
  const toggleTheme = () => {
    setTheme(prev => {
      const newTheme = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('elite-chat-theme', newTheme);
      return newTheme;
    });
  };

  // Auto-scroll to bottom when messages change or loading state changes
  useEffect(() => {
    const scrollToBottom = () => {
      // For ScrollArea component, we need to find the viewport element
      const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
      // Also try standard scrollIntoView as fallback
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    };
    
    // Small delay to ensure DOM updates and animations are complete
    const timeoutId = setTimeout(scrollToBottom, 150);
    
    return () => clearTimeout(timeoutId);
  }, [messages, isLoading]);

  // Command palette and inline commands keyboard shortcuts
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
      
      // Handle arrow keys for inline command navigation
      if (showInlineCommand) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedCommandIndex(prev => 
            prev < inlineCommands.length - 1 ? prev + 1 : 0
          );
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedCommandIndex(prev => 
            prev > 0 ? prev - 1 : inlineCommands.length - 1
          );
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const selectedCommand = inlineCommands[selectedCommandIndex];
          setInput(selectedCommand.command + ' ');
          setShowInlineCommand(false);
          inputRef.current?.focus();
        } else if (e.key === 'Escape') {
          setShowInlineCommand(false);
        }
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [showInlineCommand, selectedCommandIndex, inlineCommands]);

  const handleSendMessage = async (messageText?: string) => {
    const messageToSend = messageText || input.trim();
    if (!messageToSend || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: messageToSend,
      sender: 'user',
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = messageToSend;
    if (!messageText) setInput(''); // Only clear input if not from follow-up question
    setIsLoading(true);

    try {
      // Get selected model from localStorage
      const selectedModel = localStorage.getItem('selectedLLMModel') || DEFAULT_MODEL_ID;
      const selectedProvider = localStorage.getItem('selectedLLMProvider') || 'openai';
      
      // Update current model display using proper lookup
      const displayModel = getModelDisplayName(selectedModel);
      setCurrentModel(displayModel);
      
      // Call the RAG service via Node.js proxy
      const response = await fetch('/api/v2/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: currentInput,
          model: selectedModel,
          provider: selectedProvider
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Handle JSON response from RAG service
      const data = await response.json();
      
      const aiResponse = data.response || '';
      const sources = data.sources || [];
      
      const markdownPattern = /```|\n\s*#|\*\*|\n\s*[-*+]\s/;
      const isMarkdown = markdownPattern.test(aiResponse);

      // Generate follow-up questions before displaying the message
      let followUpQuestions: FollowUpQuestion[] = [];
      try {
        const mappedSources = sources.map((source: any) => ({
          text: source.content_preview || source.text || '',
          reference: source.title || source.source || source.reference || ''
        }));

        followUpQuestions = await generateFollowUpQuestions({
          userQuestion: currentInput,
          aiResponse: aiResponse.trim(),
          sources: mappedSources,
          conversationHistory: messages.slice(-4).map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.content
          }))
        });
      } catch (followUpError) {
        console.error('Failed to generate follow-up questions:', followUpError);
        // Continue without follow-up questions if generation fails
      }

      // Create the complete message with both answer and follow-up questions
      const messageId = (Date.now() + 1).toString();
      const followUpQuestionObjects: FollowUpQuestion[] = followUpQuestions.map((q, index) => ({
        ...q,
        id: q.id || `${messageId}-fu-${index}`,
      }));

      const aiMessage: Message = {
        id: messageId,
        content: aiResponse.trim(),
        sender: 'assistant',
        timestamp: Date.now(),
        isFormatted: isMarkdown,
        sources: sources.map((source: any) => ({
          text: source.content_preview || source.text || '',
          reference: source.title || source.source || source.reference || ''
        })),
        followUpQuestions: followUpQuestionObjects.length > 0 ? followUpQuestionObjects : undefined
      };

      // Add the complete message with everything ready
      setMessages(prev => [...prev, aiMessage]);
      setIsLoading(false);
    } catch (error) {
      console.error('Error calling RAG service:', error);
      
      // Add error message
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `Sorry, I encountered an error while processing your request. Please make sure the RAG service is running and try again. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        sender: 'assistant',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !showInlineCommand) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  // Handle input changes with inline command detection
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
    
    // Detect slash commands
    if (value.startsWith('/') && value.length > 1) {
      const command = value.toLowerCase();
      const hasMatch = inlineCommands.some(cmd => 
        cmd.command.toLowerCase().startsWith(command)
      );
      setShowInlineCommand(hasMatch);
      setCommandFilter(command);
    } else {
      setShowInlineCommand(false);
    }
  };
  
  // Toggle message expansion
  const toggleMessageExpansion = (messageId: string) => {
    setExpandedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };
  
  // Handle voice input
  const handleVoiceInput = () => {
    setIsRecording(!isRecording);
    // In a real implementation, this would use the Web Speech API
    if (!isRecording) {
      // Start recording
      console.log('Starting voice recording...');
    } else {
      // Stop recording
      console.log('Stopping voice recording...');
    }
  };

  const handleFollowUpClick = (question: string) => {
    setInput(question);
    // Optionally auto-send the question
    // handleSendMessage(question);
  };


  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const regenerateMessage = (id: string) => {
    // Simulate regeneration
    setIsLoading(true);
    setTimeout(() => {
      setMessages(prev => prev.map(msg => 
        msg.id === id 
          ? { ...msg, content: "This is a regenerated response with updated content." }
          : msg
      ));
      setIsLoading(false);
    }, 1500);
  };

  // Enhanced Typing indicator with Framer Motion
  const TypingIndicator = () => (
    <motion.div 
      className="flex items-center gap-1 px-1"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
    >
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 bg-[var(--primary)] rounded-full"
          animate={{
            y: [0, -8, 0],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut"
          }}
        />
      ))}
    </motion.div>
  );

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-[var(--background)] text-[var(--text)] relative overflow-hidden">
        {/* Animated Theme Toggle Button */}
        <motion.div 
          className="fixed top-4 right-4 z-50"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        >
          <motion.button
            onClick={toggleTheme}
            className="flex items-center justify-center p-3 bg-[var(--card)] text-[var(--text)] rounded-full shadow-lg hover:shadow-xl transition-all duration-300 border-2 border-[var(--primary)] hover:bg-[var(--background-secondary)]"
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            whileHover={{ scale: 1.1, rotate: 180 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <AnimatePresence mode="wait">
              {theme === 'light' ? (
                <motion.svg 
                  key="moon"
                  width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <path d="M20 14.12A7.78 7.78 0 019.88 4a7.78 7.78 0 002.9 15.1 7.78 7.78 0 007.22-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </motion.svg>
              ) : (
                <motion.svg 
                  key="sun"
                  width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
                  initial={{ rotate: 90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 2v2m0 16v2M2 12h2m16 0h2m-3-7l-1.5 1.5M4.93 4.93l1.5 1.5m11.14 11.14l1.5 1.5M4.93 19.07l1.5-1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </motion.svg>
              )}
            </AnimatePresence>
          </motion.button>
        </motion.div>

        {/* Interactive Background Elements */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <motion.div 
            className="absolute w-[600px] h-[600px] rounded-full blur-3xl opacity-20"
            style={{
              background: `radial-gradient(circle at center, var(--primary) 0%, transparent 70%)`,
              x: useTransform(mouseX, [-500, 500], [-50, 50]),
              y: useTransform(mouseY, [-500, 500], [-50, 50]),
            }}
            initial={{ x: '-10%', y: '-10%' }}
          />
          <motion.div 
            className="absolute w-[600px] h-[600px] rounded-full blur-3xl opacity-20"
            style={{
              background: `radial-gradient(circle at center, var(--primary) 0%, transparent 70%)`,
              x: useTransform(mouseX, [-500, 500], [50, -50]),
              y: useTransform(mouseY, [-500, 500], [50, -50]),
            }}
            initial={{ x: '90%', y: '90%' }}
          />
          
          {/* Animated particles */}
          <AnimatePresence>
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 bg-[var(--primary)] rounded-full opacity-30"
                initial={{ 
                  x: Math.random() * window.innerWidth,
                  y: Math.random() * window.innerHeight,
                  scale: 0
                }}
                animate={{ 
                  y: [null, Math.random() * window.innerHeight],
                  scale: [0, 1, 0],
                  opacity: [0, 0.5, 0]
                }}
                transition={{
                  duration: Math.random() * 10 + 10,
                  repeat: Infinity,
                  delay: Math.random() * 5,
                  ease: "easeInOut"
                }}
              />
            ))}
          </AnimatePresence>
        </div>
        
        {/* Command Palette */}
        <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
          <CommandInput placeholder="Type a command or search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => setInput("TD claim requirements")}>
                <Sparkles className="mr-2 h-4 w-4" />
                TD claim requirements
              </CommandItem>
              <CommandItem onSelect={() => setInput("Boot allowance policy")}>
                <Sparkles className="mr-2 h-4 w-4" />
                Boot allowance policy
              </CommandItem>
              <CommandItem onSelect={() => setInput("Travel authorization")}>
                <Sparkles className="mr-2 h-4 w-4" />
                Travel authorization
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>

        {/* Main Content - Full Width */}
        <div className="flex-1 flex flex-col relative w-full">
          {/* Enhanced Header */}
          <motion.header 
            className="border-b border-[var(--border)] glass sticky top-0 z-40"
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <div className="flex items-center justify-between p-6">
              <div className="flex items-center gap-3">
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => window.location.href = '/'}
                    className="hover:bg-[var(--background-secondary)] text-[var(--text)]"
                    aria-label="Back to home"
                  >
                    <ArrowLeft size={20} />
                  </Button>
                </motion.div>
                <motion.div 
                  className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center shadow-lg"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  whileHover={{ scale: 1.1 }}
                >
                  <Sparkles size={16} className="text-white" />
                </motion.div>
                <motion.h1 
                  className="text-xl font-semibold gradient-text"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  Policy Assistant
                </motion.h1>
              </div>
              <motion.div 
                className="flex items-center gap-2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => setCommandOpen(true)}
                        className="hover:bg-[var(--background-secondary)] text-[var(--text)] relative overflow-hidden"
                      >
                        <CommandIcon size={18} />
                        <motion.div
                          className="absolute inset-0 bg-[var(--primary)] opacity-0"
                          whileHover={{ opacity: 0.1 }}
                          transition={{ duration: 0.3 }}
                        />
                      </Button>
                    </motion.div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Command Palette (⌘K)</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button variant="ghost" size="icon" className="hover:bg-[var(--background-secondary)] text-[var(--text)] relative overflow-hidden">
                        <Settings size={18} />
                        <motion.div
                          className="absolute inset-0 bg-[var(--primary)] opacity-0"
                          whileHover={{ opacity: 0.1 }}
                          transition={{ duration: 0.3 }}
                        />
                      </Button>
                    </motion.div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Settings</p>
                  </TooltipContent>
                </Tooltip>
              </motion.div>
            </div>
          </motion.header>

          {/* Messages Area */}
          <ScrollArea ref={scrollAreaRef} className="flex-1 relative">
            {messages.length === 0 ? (
              <motion.div 
                className="flex items-center justify-center h-full p-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                <div className="text-center max-w-2xl mx-auto">
                  <motion.h2 
                    className="text-3xl font-bold mb-8 gradient-text"
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    How can I help you today?
                  </motion.h2>
                  <motion.div 
                    className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                    initial="hidden"
                    animate="visible"
                    variants={{
                      hidden: { opacity: 0 },
                      visible: {
                        opacity: 1,
                        transition: {
                          staggerChildren: 0.1
                        }
                      }
                    }}
                  >
                    {[
                      { title: "TD claim requirements", subtitle: "explain travel claim process", icon: "📋" },
                      { title: "Boot allowance policy", subtitle: "footwear entitlements and rates", icon: "👢" },
                      { title: "Meal rate guidelines", subtitle: "per diem and meal allowances", icon: "🍽️" },
                      { title: "Travel authorization", subtitle: "approval process and forms", icon: "✈️" }
                    ].map((item, index) => (
                      <motion.div
                        key={index}
                        variants={{
                          hidden: { y: 20, opacity: 0 },
                          visible: { y: 0, opacity: 1 }
                        }}
                        whileHover={{ scale: 1.05, y: -5 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Card 
                          className="cursor-pointer group glass rounded-2xl transition-all duration-300 hover:shadow-xl" 
                          onClick={() => {
                            setInput(item.title);
                            inputRef.current?.focus();
                          }}
                        >
                          <CardContent className="p-6 relative">
                            <div className="flex items-start gap-3">
                              <span className="text-2xl">{item.icon}</span>
                              <div className="flex-1">
                                <div className="font-semibold text-base mb-1 text-[var(--text)] group-hover:text-[var(--primary)] transition-colors">{item.title}</div>
                                <div className="text-sm text-[var(--text-secondary)] opacity-80">{item.subtitle}</div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
              </motion.div>
            ) : (
              <div className="max-w-4xl mx-auto px-6 py-8">
                <AnimatePresence>
                  {messages.map((message, messageIndex) => {
                    const isExpanded = expandedMessages.has(message.id);
                    const shouldTruncate = message.content.length > 500;
                    const displayContent = shouldTruncate && !isExpanded 
                      ? message.content.slice(0, 400) + '...' 
                      : message.content;
                    
                    return (
                      <motion.div 
                        key={message.id} 
                        className={cn("mb-8", message.sender === 'user' ? 'ml-16' : 'mr-16')}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ 
                          delay: messageIndex * 0.05,
                          type: "spring",
                          stiffness: 500,
                          damping: 30
                        }}
                      >
                        <div className={cn("flex gap-4", message.sender === 'user' ? 'justify-end' : 'justify-start')}>
                          {message.sender === 'assistant' && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ delay: messageIndex * 0.05 + 0.1 }}
                            >
                              <Avatar className="h-10 w-10 border border-[var(--border)] shadow-lg">
                                <AvatarFallback className="bg-[var(--primary)] text-white font-semibold">
                                  P
                                </AvatarFallback>
                              </Avatar>
                            </motion.div>
                          )}
                          <motion.div 
                            className={cn("max-w-[85%] group", message.sender === 'user' ? 'order-1' : '')}
                            whileHover={{ scale: 1.01 }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          >
                            <Card className={cn(
                              "border border-[var(--border)] shadow-lg transition-all duration-300",
                              message.sender === 'user' 
                                ? 'bg-[var(--primary)] text-white border-transparent hover:shadow-2xl' 
                                : 'glass hover:shadow-2xl backdrop-blur-xl'
                            )}>
                              <CardContent className="p-6 relative overflow-hidden">
                                {/* Animated gradient overlay on hover */}
                                <motion.div
                                  className="absolute inset-0 opacity-0 pointer-events-none"
                                  style={{
                                    background: message.sender === 'user' 
                                      ? 'radial-gradient(circle at var(--mouse-x) var(--mouse-y), rgba(255,255,255,0.1) 0%, transparent 60%)'
                                      : 'radial-gradient(circle at var(--mouse-x) var(--mouse-y), rgba(var(--primary-rgb),0.1) 0%, transparent 60%)'
                                  }}
                                  whileHover={{ opacity: 1 }}
                                  transition={{ duration: 0.3 }}
                                />
                                
                                <div className="leading-relaxed text-[var(--text)] relative z-10"
                                  style={message.sender === 'user' ? { color: 'white' } : {}}
                                >
                                  {message.sender === 'assistant' && message.isFormatted ? (
                                    <MarkdownRenderer>{displayContent}</MarkdownRenderer>
                                  ) : (
                                    <div className="whitespace-pre-wrap break-words overflow-hidden">{displayContent}</div>
                                  )}
                                  
                                  {shouldTruncate && (
                                    <motion.button
                                      className="mt-3 px-3 py-1.5 text-sm font-medium bg-[var(--primary)] text-white rounded-full hover:bg-[var(--primary-hover)] transition-all duration-200 flex items-center gap-1.5 shadow-sm hover:shadow-md"
                                      onClick={() => toggleMessageExpansion(message.id)}
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                    >
                                      {isExpanded ? 'Show less' : 'Read more'}
                                      <ChevronDown 
                                        size={16} 
                                        className={cn(
                                          "transition-transform duration-200",
                                          isExpanded ? "rotate-180" : ""
                                        )}
                                      />
                                    </motion.button>
                                  )}
                                </div>
                            
                            {/* Sources Section */}
                            {message.sources && message.sources.length > 0 && (
                              <div className="mt-4 pt-4 border-t border-[var(--border)] opacity-80">
                                <div className="flex items-center gap-2 mb-3 text-sm font-medium text-[var(--text-secondary)]">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-70">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14,2 14,8 20,8"/>
                                    <line x1="16" y1="13" x2="8" y2="13"/>
                                    <line x1="16" y1="17" x2="8" y2="17"/>
                                    <polyline points="10,9 9,9 8,9"/>
                                  </svg>
                                  <span>Sources</span>
                                </div>
                                {message.sources.map((source, i) => (
                                  <div key={i} className="mb-3 last:mb-0 p-3 rounded-lg bg-[var(--background-secondary)]/50 border-l-3 border-[var(--primary)]">
                                    <div className="flex items-start gap-2 mb-2">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-1 opacity-60">
                                        <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1-.008-1-1.031V20c0 1 0 1 1 1z"/>
                                        <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
                                      </svg>
                                      <span className="text-sm italic text-[var(--text-secondary)] leading-relaxed">{source.text}</span>
                                    </div>
                                    {source.reference && (
                                      <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]/80 mt-2 pt-2 border-t border-[var(--border)]/30">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60">
                                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72"/>
                                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72"/>
                                        </svg>
                                        <span className="font-medium">{source.reference}</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                        
                        {/* Enhanced Follow-up Questions with Smart Progressive Disclosure */}
                        {message.sender === 'assistant' && message.followUpQuestions && message.followUpQuestions.length > 0 && (
                          <SuggestionController 
                            questions={message.followUpQuestions}
                            onQuestionClick={handleFollowUpClick}
                            messageId={message.id}
                            isLatestMessage={messageIndex === messages.length - 1}
                            className="mt-4"
                          />
                        )}
                        
                        {/* Message Actions */}
                        {message.sender === 'assistant' && (
                          <motion.div 
                            className="flex items-center gap-2 mt-3 opacity-0 group-hover:opacity-100"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 0 }}
                            whileHover={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => {
                                      copyMessage(message.content);
                                      // Add visual feedback
                                    }}
                                    className="h-8 px-2 hover:bg-[var(--background-secondary)] text-[var(--text)] relative overflow-hidden"
                                  >
                                    <Copy size={14} />
                                  </Button>
                                </motion.div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Copy message</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => regenerateMessage(message.id)}
                                    className="h-8 px-2 hover:bg-[var(--background-secondary)] text-[var(--text)] relative overflow-hidden"
                                  >
                                    <motion.div
                                      animate={{ rotate: isLoading ? 360 : 0 }}
                                      transition={{ duration: 1, repeat: isLoading ? Infinity : 0, ease: "linear" }}
                                    >
                                      <RefreshCw size={14} />
                                    </motion.div>
                                  </Button>
                                </motion.div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Regenerate response</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => handleVoiceInput()}
                                    className="h-8 px-2 hover:bg-[var(--background-secondary)] text-[var(--text)]"
                                  >
                                    <Volume2 size={14} />
                                  </Button>
                                </motion.div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Read aloud</p>
                              </TooltipContent>
                            </Tooltip>
                          </motion.div>
                        )}
                        
                        <motion.div 
                          className="text-xs text-[var(--text-secondary)] mt-2 px-2 flex items-center gap-2"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 0.7 }}
                              transition={{ delay: 0.5 }}
                            >
                              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {message.sender === 'assistant' && currentModel && (
                                <span className="opacity-60">• {currentModel}</span>
                              )}
                            </motion.div>
                          </motion.div>
                          {message.sender === 'user' && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ delay: messageIndex * 0.05 + 0.1 }}
                            >
                              <Avatar className="h-10 w-10 border border-[var(--border)] shadow-lg">
                                <AvatarFallback className="bg-[var(--primary)] text-white font-semibold">
                                  U
                                </AvatarFallback>
                              </Avatar>
                            </motion.div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {isLoading && (
                  <motion.div 
                    className="mr-16 mb-8"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                  >
                    <div className="flex gap-4 justify-start">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      >
                        <Avatar className="h-10 w-10 border border-[var(--border)] shadow-lg">
                          <AvatarFallback className="bg-[var(--primary)] text-white font-semibold">
                            P
                          </AvatarFallback>
                        </Avatar>
                      </motion.div>
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.1 }}
                      >
                        <Card className="glass border border-[var(--border)] backdrop-blur-xl">
                          <CardContent className="p-6">
                            <TypingIndicator />
                          </CardContent>
                        </Card>
                      </motion.div>
                    </div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Enhanced Input Area */}
          <motion.div 
            className="border-t border-[var(--border)] glass p-6 relative"
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <div className="max-w-4xl mx-auto">
              <div className="relative flex items-end gap-4">
                <div className="flex-1 relative">
                  {/* Inline Command Palette */}
                  <AnimatePresence>
                    {showInlineCommand && (
                      <motion.div
                        className="absolute bottom-full mb-2 left-0 right-0 bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                      >
                        <div className="p-2">
                          {inlineCommands
                            .filter(cmd => cmd.command.toLowerCase().startsWith(commandFilter.toLowerCase()))
                            .map((cmd, index) => (
                              <motion.div
                                key={cmd.command}
                                className={cn(
                                  "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors",
                                  selectedCommandIndex === index 
                                    ? "bg-[var(--primary)] text-white" 
                                    : "hover:bg-[var(--background-secondary)]"
                                )}
                                onClick={() => {
                                  setInput(cmd.command + ' ');
                                  setShowInlineCommand(false);
                                  inputRef.current?.focus();
                                }}
                                whileHover={{ x: 5 }}
                              >
                                <div className={cn(
                                  "w-8 h-8 rounded-lg flex items-center justify-center",
                                  selectedCommandIndex === index
                                    ? "bg-white/20"
                                    : "bg-[var(--background-secondary)]"
                                )}>
                                  {cmd.icon}
                                </div>
                                <div className="flex-1">
                                  <div className="font-medium text-sm">{cmd.label}</div>
                                  <div className="text-xs opacity-70">{cmd.description}</div>
                                </div>
                                <kbd className="text-xs opacity-50">{cmd.command}</kbd>
                              </motion.div>
                            ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyPress}
                    placeholder="Message Policy Assistant..."
                    className="h-[64px] pr-32 pl-4 rounded-3xl border-[var(--border)] bg-[var(--card)] glass focus:bg-[var(--background-secondary)] transition-all duration-300 text-base text-[var(--text)] placeholder:text-[var(--text-secondary)]"
                  />
                  
                  {/* Action Buttons */}
                  <div className="absolute right-3 bottom-3 flex items-center gap-2">
                    <AnimatePresence>
                      {input.length > 0 && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 rounded-xl"
                                onClick={() => setInput('')}
                              >
                                <X size={16} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Clear</p>
                            </TooltipContent>
                          </Tooltip>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-xl"
                            onClick={() => console.log('Attach file')}
                          >
                            <Paperclip size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Attach file</p>
                        </TooltipContent>
                      </Tooltip>
                    </motion.div>
                    
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className={cn(
                              "h-8 w-8 rounded-xl",
                              isRecording && "bg-red-500 text-white"
                            )}
                            onClick={handleVoiceInput}
                          >
                            <motion.div
                              animate={isRecording ? { scale: [1, 1.2, 1] } : {}}
                              transition={{ duration: 1, repeat: Infinity }}
                            >
                              <Mic size={16} />
                            </motion.div>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{isRecording ? 'Stop recording' : 'Voice input'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </motion.div>
                    
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-xl"
                            onClick={() => setShowHelpDialog(true)}
                          >
                            <HelpCircle size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Help</p>
                        </TooltipContent>
                      </Tooltip>
                    </motion.div>
                    
                    <motion.div
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <Button
                        onClick={() => handleSendMessage()}
                        disabled={!input.trim() || isLoading}
                        size="icon"
                        className="h-10 w-10 rounded-2xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] border-0 shadow-lg transition-all duration-300 hover:shadow-xl disabled:opacity-50"
                      >
                        <motion.div
                          animate={isLoading ? { rotate: 360 } : {}}
                          transition={{ duration: 1, repeat: isLoading ? Infinity : 0, ease: "linear" }}
                        >
                          <Send size={18} />
                        </motion.div>
                      </Button>
                    </motion.div>
                  </div>
                </div>
              </div>
              <motion.div 
                className="text-xs text-[var(--text-secondary)] text-center mt-4 flex items-center justify-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <span>Policy Assistant can make mistakes. Please double-check responses.</span>
                <span className="text-[var(--text-secondary)]/60">•</span>
                <span className="text-[var(--text-secondary)]/70">Powered by Haystack & {currentModel}</span>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Help Dialog */}
      <Dialog open={showHelpDialog} onOpenChange={setShowHelpDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto glass border-[var(--border)] bg-[var(--card)]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
              <HelpCircle size={24} className="text-[var(--primary)]" />
              Policy Assistant Help
            </DialogTitle>
            <DialogDescription className="text-[var(--text-secondary)] text-base">
              Learn how to effectively use the Policy Assistant for your administrative needs.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 text-[var(--text)]">
            {/* What it does */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-[var(--primary)]">What is the Policy Assistant?</h3>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                The Policy Assistant is an AI-powered guide designed to help you navigate policies, procedures, and administrative requirements. 
                It can answer questions about regulations, benefits, claims, travel procedures, and more.
              </p>
            </div>

            {/* Question types */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-[var(--primary)]">What can you ask about?</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="font-medium text-[var(--text)]">Travel & Claims</h4>
                  <ul className="text-sm text-[var(--text-secondary)] space-y-1">
                    <li>• Travel duty (TD) claims</li>
                    <li>• Expense reimbursements</li>
                    <li>• Travel allowances</li>
                    <li>• Accommodation policies</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium text-[var(--text)]">Benefits & Pay</h4>
                  <ul className="text-sm text-[var(--text-secondary)] space-y-1">
                    <li>• Military benefits</li>
                    <li>• Leave policies</li>
                    <li>• Pay and allowances</li>
                    <li>• Pension information</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium text-[var(--text)]">Administrative</h4>
                  <ul className="text-sm text-[var(--text-secondary)] space-y-1">
                    <li>• Unit procedures</li>
                    <li>• Forms and applications</li>
                    <li>• Contact information</li>
                    <li>• Regulations and directives</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium text-[var(--text)]">General Inquiries</h4>
                  <ul className="text-sm text-[var(--text-secondary)] space-y-1">
                    <li>• Policy clarifications</li>
                    <li>• Process explanations</li>
                    <li>• Document requirements</li>
                    <li>• Timeline questions</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Example questions */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-[var(--primary)]">Example Questions</h3>
              <div className="bg-[var(--background-secondary)] rounded-lg p-4 space-y-2">
                <div className="text-sm text-[var(--text-secondary)]">
                  <p>• "What are the TD claim requirements for travel over 12 hours?"</p>
                  <p>• "How do I submit a claim for meal expenses during travel?"</p>
                  <p>• "What documents do I need for a posting allowance?"</p>
                  <p>• "Who do I contact for FSC services at my unit?"</p>
                  <p>• "What is the maximum accommodation rate for TD travel?"</p>
                  <p>• "How long does it take to process a benefits claim?"</p>
                </div>
              </div>
            </div>

            {/* Tips */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-[var(--primary)]">Tips for Better Results</h3>
              <div className="space-y-2 text-[var(--text-secondary)]">
                <p>• <strong>Be specific:</strong> Include details like timeframes, amounts, or specific policies</p>
                <p>• <strong>Ask follow-up questions:</strong> If you need clarification, don't hesitate to ask for more details</p>
                <p>• <strong>Use clear language:</strong> Simple, direct questions often get the best responses</p>
                <p>• <strong>Check sources:</strong> Review the provided sources for official documentation</p>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <div className="text-orange-600 dark:text-orange-400 mt-0.5">⚠️</div>
                <div className="text-sm text-orange-800 dark:text-orange-200">
                  <strong>Important:</strong> Always verify critical information with official sources or your unit's administrative staff. 
                  This assistant provides guidance but should not replace official policy documents.
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default ChatPage;