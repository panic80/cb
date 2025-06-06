import React, { useState, useEffect } from 'react';
import { Send, Settings, Copy, RefreshCw, Sparkles, Command as CommandIcon, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

/**
 * Chat page with theme consistency matching the main landing page
 */
const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  
  // Theme state matching the landing page
  const [theme, setTheme] = useState(() => {
    const storedTheme = localStorage.getItem('elite-chat-theme');
    if (storedTheme) return storedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Apply theme changes to document
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Toggle theme function
  const toggleTheme = () => {
    setTheme(prev => {
      const newTheme = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('elite-chat-theme', newTheme);
      return newTheme;
    });
  };

  // Command palette keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: input.trim(),
      role: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Simulate AI response with typing delay
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "I'm Claude, your AI assistant. I can help with analysis, writing, coding, creative tasks, and much more. This is a sophisticated chat interface with modern design elements including gradients, glassmorphism effects, and smooth animations.",
        role: 'assistant',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);
      setIsLoading(false);
    }, 2000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
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

  // Typing indicator component matching theme
  const TypingIndicator = () => (
    <div className="flex items-center gap-1 px-1">
      <div className="w-2 h-2 bg-[var(--primary)] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
      <div className="w-2 h-2 bg-[var(--primary)] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
      <div className="w-2 h-2 bg-[var(--primary)] rounded-full animate-bounce"></div>
    </div>
  );

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-[var(--background)] text-[var(--text)] relative overflow-hidden">
        {/* Theme Toggle Button */}
        <div className="fixed top-4 right-4 z-50">
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center p-3 bg-[var(--card)] text-[var(--text)] rounded-full shadow-lg hover:shadow-xl transition-all duration-300 border-2 border-[var(--primary)] hover:bg-[var(--background-secondary)] hover:scale-110"
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 14.12A7.78 7.78 0 019.88 4a7.78 7.78 0 002.9 15.1 7.78 7.78 0 007.22-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
                <path d="M12 2v2m0 16v2M2 12h2m16 0h2m-3-7l-1.5 1.5M4.93 4.93l1.5 1.5m11.14 11.14l1.5 1.5M4.93 19.07l1.5-1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>

        {/* Decorative Background Elements */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute w-[600px] h-[600px] rounded-full blur-3xl opacity-20 floating"
            style={{
              background: `radial-gradient(circle at center, var(--primary) 0%, transparent 70%)`,
              top: '-10%',
              left: '-10%',
            }}
          />
          <div className="absolute w-[600px] h-[600px] rounded-full blur-3xl opacity-20 floating"
            style={{
              background: `radial-gradient(circle at center, var(--primary) 0%, transparent 70%)`,
              bottom: '-10%',
              right: '-10%',
              animationDelay: '-1.5s',
            }}
          />
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
          {/* Header */}
          <header className="border-b border-[var(--border)] glass sticky top-0 z-40">
            <div className="flex items-center justify-between p-6">
              <div className="flex items-center gap-3">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => window.location.href = '/'}
                  className="hover:bg-[var(--background-secondary)] text-[var(--text)]"
                  aria-label="Back to home"
                >
                  <ArrowLeft size={20} />
                </Button>
                <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center">
                  <Sparkles size={16} className="text-white" />
                </div>
                <h1 className="text-xl font-semibold gradient-text">
                  Policy Assistant
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setCommandOpen(true)}
                      className="hover:bg-[var(--background-secondary)] text-[var(--text)]"
                    >
                      <CommandIcon size={18} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Command Palette (⌘K)</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="hover:bg-[var(--background-secondary)] text-[var(--text)]">
                      <Settings size={18} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Settings</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </header>

          {/* Messages Area */}
          <ScrollArea className="flex-1 relative">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full p-6">
                <div className="text-center max-w-2xl mx-auto">
                  <div className="w-20 h-20 mx-auto mb-6 bg-[var(--primary)] rounded-2xl flex items-center justify-center shadow-2xl animate-scale"
                    style={{
                      filter: 'drop-shadow(0 0 15px rgba(var(--primary-rgb), 0.3))',
                    }}
                  >
                    <Sparkles size={32} className="text-white" />
                  </div>
                  <h2 className="text-3xl font-bold mb-3 gradient-text animate-fade-up">
                    How can I help you today?
                  </h2>
                  <p className="text-[var(--text-secondary)] mb-8 text-lg animate-fade-up glass p-6 rounded-2xl"
                    style={{ animationDelay: '0.2s' }}
                  >
                    I'm your Policy Assistant. I can help with travel instructions, claims processing, and administrative policy questions.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { title: "TD claim requirements", subtitle: "explain travel claim process" },
                      { title: "Boot allowance policy", subtitle: "footwear entitlements and rates" },
                      { title: "Meal rate guidelines", subtitle: "per diem and meal allowances" },
                      { title: "Travel authorization", subtitle: "approval process and forms" }
                    ].map((item, index) => (
                      <Card 
                        key={index}
                        className="cursor-pointer group card-hover glass rounded-2xl transition-all duration-1000 transform animate-fade-up" 
                        style={{ transitionDelay: `${index * 0.1}s` }}
                        onClick={() => setInput(item.title)}
                      >
                        <CardContent className="p-6 relative">
                          <div className="font-semibold text-base mb-1 text-[var(--text)] group-hover:text-[var(--primary)] transition-colors">{item.title}</div>
                          <div className="text-sm text-[var(--text-secondary)] opacity-80">{item.subtitle}</div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto px-6 py-8">
                {messages.map((message) => (
                  <div key={message.id} className={cn("mb-8", message.role === 'user' ? 'ml-16' : 'mr-16')}>
                    <div className={cn("flex gap-4", message.role === 'user' ? 'justify-end' : 'justify-start')}>
                      {message.role === 'assistant' && (
                        <Avatar className="h-10 w-10 border border-[var(--border)]">
                          <AvatarFallback className="bg-[var(--primary)] text-white font-semibold">
                            P
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className={cn("max-w-[85%] group", message.role === 'user' ? 'order-1' : '')}>
                        <Card className={cn(
                          "border border-[var(--border)] shadow-lg transition-all duration-300 card-hover",
                          message.role === 'user' 
                            ? 'bg-[var(--primary)] text-white border-transparent' 
                            : 'glass'
                        )}>
                          <CardContent className="p-6">
                            <div className="whitespace-pre-wrap leading-relaxed text-[var(--text)]"
                              style={message.role === 'user' ? { color: 'white' } : {}}
                            >{message.content}</div>
                          </CardContent>
                        </Card>
                        
                        {/* Message Actions */}
                        {message.role === 'assistant' && (
                          <div className="flex items-center gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => copyMessage(message.content)}
                                  className="h-8 px-2 hover:bg-[var(--background-secondary)] text-[var(--text)]"
                                >
                                  <Copy size={14} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Copy message</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => regenerateMessage(message.id)}
                                  className="h-8 px-2 hover:bg-[var(--background-secondary)] text-[var(--text)]"
                                >
                                  <RefreshCw size={14} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Regenerate response</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                        
                        <div className="text-xs text-[var(--text-secondary)] mt-2 px-2">
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      {message.role === 'user' && (
                        <Avatar className="h-10 w-10 border border-[var(--border)]">
                          <AvatarFallback className="bg-[var(--primary)] text-white font-semibold">
                            U
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="mr-16 mb-8">
                    <div className="flex gap-4 justify-start">
                      <Avatar className="h-10 w-10 border border-[var(--border)]">
                        <AvatarFallback className="bg-[var(--primary)] text-white font-semibold">
                          P
                        </AvatarFallback>
                      </Avatar>
                      <Card className="glass border border-[var(--border)]">
                        <CardContent className="p-6">
                          <TypingIndicator />
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Input Area */}
          <div className="border-t border-[var(--border)] glass p-6">
            <div className="max-w-4xl mx-auto">
              <div className="relative flex items-end gap-4">
                <div className="flex-1 relative">
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="Message Policy Assistant..."
                    className="min-h-[64px] resize-none pr-14 rounded-3xl border-[var(--border)] bg-[var(--card)] glass focus:bg-[var(--background-secondary)] transition-all duration-300 text-base leading-relaxed text-[var(--text)] placeholder:text-[var(--text-secondary)]"
                    rows={1}
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!input.trim() || isLoading}
                    size="icon"
                    className="absolute right-3 bottom-3 h-10 w-10 rounded-2xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] border-0 shadow-lg transition-all duration-300 hover:shadow-xl disabled:opacity-50 card-hover"
                  >
                    <Send size={18} />
                  </Button>
                </div>
              </div>
              <div className="text-xs text-[var(--text-secondary)] text-center mt-4 flex items-center justify-center gap-2">
                <span>Policy Assistant can make mistakes. Please double-check responses.</span>
                <span className="text-[var(--text-secondary)]/60">•</span>
                <span className="text-[var(--text-secondary)]/80">Press ⌘K for commands</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default ChatPage;