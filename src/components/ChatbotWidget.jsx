import React, { useState, useRef, useEffect, useCallback, Component } from 'react';
import axios from 'axios'; // Use axios as it's available
import ReactMarkdown from 'react-markdown';

// SVG Icons (Simple inline SVGs)
const ChatIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
);

const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

// Helper function to render table data with Tailwind
const renderTable = (tableData) => {
    if (!Array.isArray(tableData) || tableData.length === 0) {
        return null;
    }
    const headers = tableData[0];
    const rows = tableData.slice(1);

    return (
        <table className="border-collapse w-full mt-2 text-sm border border-gray-300">
            <thead>
                <tr>
                    {headers.map((header, index) => (
                        <th key={index} className="border border-gray-300 p-1.5 bg-gray-100 text-left font-semibold">{header}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                            <td key={cellIndex} className="border border-gray-300 p-1.5 text-left">{cell}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

// Helper function to format bot message text (keeping internal logic)
const formatBotMessage = (text) => {
    const answerMarker = 'Answer:';
    const reasonMarker = 'Reason:';
    const answerIndex = text.indexOf(answerMarker);
    const reasonIndex = text.indexOf(reasonMarker);

    if (answerIndex !== -1 && reasonIndex !== -1 && reasonIndex > answerIndex) {
        const answerContent = text.substring(answerIndex + answerMarker.length, reasonIndex).trim();
        // const reasonContent = text.substring(reasonIndex + reasonMarker.length).trim(); // Reason hidden previously

        return (
            <div>
                <strong className="block mb-1 font-semibold">Answer</strong>
                <p className="mt-0 mb-3">{answerContent}</p>
                {/* <strong className="block mb-1 font-semibold">Reason</strong> */}
                {/* <p className="mt-0 mb-0">{reasonContent}</p> */}
            </div>
        );
    }
    // Use ReactMarkdown for consistent markdown rendering (links, lists, etc.)
    // Apply Tailwind prose styles for better markdown formatting if needed, or basic styles
    // Apply styling to a wrapper div instead of directly to ReactMarkdown
    return <div className="prose prose-sm max-w-none"><ReactMarkdown>{text}</ReactMarkdown></div>;
};

// Error Boundary Component
// Error Boundary Component (Original, logging removed)
class ChatErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ChatbotWidget Error:', error);
        console.error('Error Info:', errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="fixed bottom-5 right-5 z-50 bg-red-100 text-red-800 p-4 rounded-lg shadow-lg">
                    <p>Chat widget encountered an error. Please refresh the page.</p>
                </div>
            );
        }
        return this.props.children;
    }
}

function ChatbotWidget() {
    const initialBotMessage = { sender: 'bot', text: 'Hello! How can I help you with the travel instructions today?', sources: [], isError: false };
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([initialBotMessage]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const chatWindowRef = useRef(null);
    const toggleButtonRef = useRef(null); // Ref for the toggle button

    const suggestedQuestions = [
        "What is the per diem rate for meals?",
        "How do I claim expenses for using my personal vehicle?",
        "What are the rules for accommodation reimbursement?",
        "Can I book my own flights?",
        "How long does it take to get my travel claim processed?"
    ];

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    // Scroll to bottom when messages change or window opens/closes
    useEffect(scrollToBottom, [messages, isOpen]);

    // Focus input when chat opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    // Focus Management (Trap and Return) (Original, logging removed)
    useEffect(() => {
        if (!isOpen || !chatWindowRef.current) {
            return;
        }

        const focusableElements = chatWindowRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (!firstElement || !lastElement) {
            console.warn('No focusable elements found in chat window');
            return;
        }

        const handleKeyDown = (event) => {
            if (event.key !== 'Tab') return;

            if (event.shiftKey) { // Shift + Tab
                if (document.activeElement === firstElement) {
                    lastElement.focus();
                    event.preventDefault();
                }
            } else { // Tab
                if (document.activeElement === lastElement) {
                    firstElement.focus();
                    event.preventDefault();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        // Focus first element on open
        firstElement?.focus();

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            // Return focus to the toggle button when closing
            if (toggleButtonRef.current) {
                toggleButtonRef.current.focus();
            }
        };
    }, [isOpen]);

const toggleChat = () => { // Original, logging removed
    setIsOpen(!isOpen);
};
    const handleInputChange = (event) => {
        setInputValue(event.target.value);
    };

    // Consolidated function to send a message and handle response
    const sendMessage = useCallback(async (messageText, isUserInput = false) => {
        if (!messageText || isLoading) return;

        // Add user message only if it's direct input or a suggestion click
        if (isUserInput) {
            setMessages(prevMessages => [...prevMessages, { sender: 'user', text: messageText, isError: false }]);
        }

        setIsLoading(true);
        // Clear input only if it was user typed input
        if (isUserInput && inputValue) {
            setInputValue('');
        }


        try {
            const response = await axios.post('/api/v2/chat', { message: messageText }, {
                timeout: 30000 // 30 second timeout
            });

            const { reply: botReply, sources, displayAsTable, tableData } = response.data;

            if (botReply || (displayAsTable && tableData)) {
                setMessages(prevMessages => [...prevMessages, {
                    sender: 'bot',
                    text: botReply || '',
                    sources: sources || [],
                    displayAsTable: displayAsTable || false,
                    tableData: tableData || null,
                    isError: false
                }]);
            } else {
                 // Treat empty successful reply as an issue, but maybe less severe?
                 console.warn('Received empty but successful reply from server.');
                 setMessages(prevMessages => [...prevMessages, { sender: 'bot', text: "I received an empty response. Could you try rephrasing?", sources: [], isError: true }]);
            }

        } catch (error) {
            console.error('Error fetching chatbot response:', error);
            let errorMessage = 'Sorry, I encountered an error. Please try again later.';
            if (error.response) {
                 errorMessage = error.response.data?.message || `Sorry, there was a server error (${error.response.status}).`;
            } else if (error.request) {
                errorMessage = 'Sorry, I could not reach the server. Please check your connection.';
            } else if (error.message) {
                errorMessage = `An unexpected error occurred: ${error.message}`;
            }
            setMessages(prevMessages => [...prevMessages, { sender: 'bot', text: errorMessage, sources: [], isError: true }]);
        } finally {
            setIsLoading(false);
             // Refocus input after response/error
            if (isOpen && inputRef.current) {
                inputRef.current.focus();
            }
        }
    }, [isLoading, isOpen, inputValue]); // Added isOpen and inputValue dependencies

    // Handler for form submission
    const handleSendMessage = (event) => {
        event.preventDefault();
        const userMessage = inputValue.trim();
        sendMessage(userMessage, true); // Indicate it's user input
    };

    // Handler for clicking a suggested question
    const handleSuggestedQuestionClick = (question) => {
        sendMessage(question, true); // Indicate it's user input (acts like typing and sending)
    };

    // Handler for clearing chat
    const handleClearChat = () => {
        setMessages([initialBotMessage]);
        setInputValue(''); // Clear input field as well
        if (inputRef.current) {
            inputRef.current.focus(); // Keep focus in input
        }
    };

    // Wrap state updates in try-catch
    const safeSetIsOpen = (value) => {
        try {
            console.log('Attempting to set isOpen to:', value);
            setIsOpen(value);
        } catch (error) {
            console.error('Error setting isOpen:', error);
        }
    };

    return (
        <ChatErrorBoundary>
            {isOpen ? (
                <div ref={chatWindowRef} className="fixed bottom-5 right-5 z-50 max-w-md md:max-w-lg h-[70vh] md:h-[80vh] bg-white rounded-lg shadow-xl flex flex-col overflow-hidden border border-gray-300">
                    {/* Header */}
                    <div className="bg-blue-600 text-white p-3 text-base font-bold flex justify-between items-center flex-shrink-0">
                        <span>Travel Assistant</span>
                        <div className="flex items-center space-x-2">
                             {/* Clear Chat Button */}
                             <button
                                onClick={handleClearChat}
                                className="bg-transparent border-none text-white text-xs p-1 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50"
                                aria-label="Clear Chat History"
                                title="Clear Chat"
                                disabled={isLoading || messages.length <= 1} // Disable if loading or only initial message
                            >
                                Clear
                            </button>
                            {/* Close Button */}
                            <button
                                onClick={toggleChat}
                                className="bg-transparent border-none text-white p-1 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50"
                                aria-label="Close Chat"
                            >
                                <CloseIcon />
                            </button>
                        </div>
                    </div>

                    {/* Message List */}
                    <div className="flex-grow p-3 overflow-y-auto border-b border-gray-200 space-y-3 bg-gray-50">
                        {messages.map((msg, index) => (
                            <div
                                key={index}
                                className={`p-2 px-3 rounded-2xl max-w-[85%] break-words flex flex-col ${
                                    msg.sender === 'user'
                                        ? 'bg-blue-500 text-white self-end ml-auto'
                                        : msg.isError // Check for error flag first
                                        ? 'bg-red-100 text-red-800 border border-red-200 self-start mr-auto' // Distinct error style
                                        : 'bg-gray-200 text-gray-800 self-start mr-auto' // Standard bot style
                                }`}
                            >
                                {/* Render message content: Table or Formatted Text */}
                                <div className="message-content">
                                    {msg.sender === 'user' ? (
                                        msg.text // Plain text for user
                                    ) : msg.displayAsTable && msg.tableData ? (
                                        renderTable(msg.tableData) // Render table
                                    ) : (
                                        formatBotMessage(msg.text) // Formatted/Markdown text for bot/error
                                    )}
                                </div>

                                {/* Render sources if available for non-error bot messages */}
                                {msg.sender === 'bot' && !msg.isError && msg.sources && msg.sources.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-gray-300 border-opacity-50">
                                        <strong className="text-xs font-semibold text-gray-600">Sources:</strong>
                                        <ul className="mt-1 pl-4 text-xs list-disc space-y-1">
                                            {msg.sources.map((source, srcIndex) => (
                                                <li key={srcIndex}>
                                                    <a
                                                        href={source.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-700 hover:underline break-all"
                                                        title={source.url}
                                                    >
                                                        {source.title || new URL(source.url).hostname} {/* Display title or hostname */}
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        ))}
                        {isLoading && (
                            <div className="p-2 px-3 rounded-2xl max-w-[85%] italic text-gray-500 self-start mr-auto bg-gray-100">
                                Thinking...
                            </div>
                        )}
                        {/* Element to scroll to */}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Suggested Questions Area */}
                    <div className="p-2 border-t border-gray-200 flex flex-wrap gap-2 flex-shrink-0 bg-white">
                        {suggestedQuestions.map((q, index) => (
                            <button
                                key={index}
                                onClick={() => handleSuggestedQuestionClick(q)}
                                className="bg-gray-100 border border-gray-300 rounded-full py-1 px-3 text-xs cursor-pointer text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={isLoading}
                            >
                                {q}
                            </button>
                        ))}
                    </div>

                    {/* Input Area */}
                    <form onSubmit={handleSendMessage} className="flex p-3 border-t border-gray-200 items-center flex-shrink-0 bg-white">
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputValue}
                            onChange={handleInputChange}
                            className="flex-grow p-2 border border-gray-300 rounded-md mr-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                            placeholder="Ask a question..."
                            aria-label="Chat input"
                            disabled={isLoading}
                        />
                        <button
                            type="submit"
                            className="p-2 px-4 bg-green-500 text-white border-none rounded-md cursor-pointer hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 disabled:bg-gray-400 disabled:cursor-not-allowed"
                            disabled={isLoading || !inputValue.trim()}
                        >
                            Send
                        </button>
                    </form>
                </div>
            ) : (
                <button
                    ref={toggleButtonRef} // Assign ref here
                    onClick={toggleChat}
                    className="fixed bottom-5 right-5 z-50 bg-blue-600 text-white rounded-full w-14 h-14 cursor-pointer shadow-lg flex items-center justify-center hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    aria-label="Open Chat"
                >
                    <ChatIcon />
                </button>
            )}
        </ChatErrorBoundary>
    );
}

export default ChatbotWidget;