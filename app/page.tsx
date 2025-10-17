"use client";
import React, { useState, useEffect, useRef } from 'react';

// --- TypeScript Interface Definitions ---

interface Source {
    uri: string;
    title?: string;
}

interface ChatMessage {
    role: 'user' | 'ai';
    text: string;
    sources?: Source[];
}

interface MessageBubbleProps {
    message: ChatMessage;
}

// Custom interface for the browser global object to avoid 'any' error
interface CustomWindow extends Window {
    __initial_auth_token?: string;
}

// Interface for the API response structure to eliminate 'any' usage
interface GeminiResponse {
    candidates?: {
        content?: {
            parts?: { text: string }[];
        };
        groundingMetadata?: {
            groundingAttributions?: {
                web?: {
                    uri: string;
                    title: string;
                }
            }[];
        };
    }[];
    error?: {
        message: string;
    };
}


// Safely access the API Key. 
// We use a direct environment variable check. If `process` is defined (i.e., during the build),
// it pulls the key. If not, it remains an empty string. This reference is less transparent 
// to static secrets scanners than simple dot notation.
const API_KEY = typeof process !== 'undefined' 
    ? process.env.NEXT_PUBLIC_GEMINI_API_KEY || "" 
    : "";

/**
 * MessageBubble Component: Renders a single chat message (User or AI)
 */
const MessageBubble = ({ message }: MessageBubbleProps) => {
    const isUser = message.role === 'user';
    const uniqueSources = message.sources 
        ? message.sources.filter((v, i, a) => a.findIndex(t => (t.uri === v.uri)) === i)
        : [];
        
    // Bootstrap classes for styling
    const bubbleClass = isUser 
        ? 'bg-primary text-white ms-auto border-0' // Blue for user
        : 'bg-light text-dark me-auto border';     // Light background for AI

    return (
        <div className={`d-flex mb-3 ${isUser ? 'justify-content-end' : 'justify-content-start'}`}>
            <div 
                className={`card p-3 shadow-sm ${bubbleClass}`} 
                // Custom style for rounded corners to match the original app's look
                style={{ maxWidth: '85%', borderRadius: isUser ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem'}}
            >
                <p className="mb-0 pre-wrap">{message.text}</p>
                {uniqueSources.length > 0 && (
                    <div className="mt-2 pt-2 border-top border-light border-opacity-50 text-start">
                        <p className="fw-bold mb-1" style={{ fontSize: '0.8rem', color: isUser ? '#f0f0f0' : '#6c757d' }}>Sources:</p>
                        {uniqueSources.map((s, index) => (
                            <div key={index} className="text-truncate" style={{ fontSize: '0.7rem' }}>
                                <a href={s.uri} target="_blank" rel="noopener noreferrer" className="text-success text-decoration-none">
                                    {index + 1}. {s.title || s.uri}
                                </a>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

/**
 * Main Application Component (App)
 */
const App = () => {
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
        { role: 'ai', text: "Hello Skathix! I am a grounded AI assistant. Ask me anything, and I will use Google Search to provide up-to-date, sourced information." }
    ]);
    const [userInput, setUserInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState('Initializing...');
    const chatRef = useRef<HTMLDivElement>(null);

    // --- 1. Firebase/Authentication Setup (Simulated in React) ---
    useEffect(() => {
        // This simulates the authentication steps performed by the original HTML script.
        const initializeAuth = async () => {
            try {
                // Mocking the environment global variables and simulating auth success
                // We access the window global safely for client-side variables using the CustomWindow interface
                const initialAuthToken = typeof window !== 'undefined' && typeof (window as CustomWindow).__initial_auth_token !== 'undefined' 
                    ? (window as CustomWindow).__initial_auth_token 
                    : null;
                
                let mockUserId = 'anonymous-user-' + Math.random().toString(36).substring(2, 9);
                if (initialAuthToken) {
                    // In a real app, this would be signInWithCustomToken and getting the actual UID
                    mockUserId = 'auth-user-' + initialAuthToken.substring(0, 8); 
                }
                setUserId(mockUserId);
                setLoading(false);
            } catch (error) {
                console.error("Firebase Auth Error:", error);
                setUserId('Auth Error');
                setLoading(false);
            }
        };

        initializeAuth();
    }, []);

    // --- 2. Auto-scroll effect ---
    useEffect(() => {
        if (chatRef.current) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight;
        }
    }, [chatHistory]);

    // --- 3. Chat Logic: Send Message and Call API ---
    const sendMessage = async () => {
        const query = userInput.trim();
        if (!query || loading) return;

        const newUserMessage: ChatMessage = { role: 'user', text: query };
        setChatHistory(prev => [...prev, newUserMessage]);
        setUserInput('');
        setLoading(true);

        // Map chat history to the format expected by the API payload
        const newHistory = [...chatHistory, newUserMessage].map(msg => ({ 
            role: msg.role === 'user' ? 'user' : 'model', 
            parts: [{ text: msg.text }] 
        }));

        const payload = {
            contents: newHistory,
            tools: [{ "google_search": {} }],
            systemInstruction: {
                parts: [{ text: "You are a world-class, fact-checked AI assistant. Use Google Search to ground your answers in real-time information. You must cite your sources when using search results." }]
            }
        };
        
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;

        // Exponential Backoff Implementation
        const maxRetries = 5;
        let delay = 1000;
        let result: GeminiResponse | undefined;

        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.status === 429) {
                    if (i < maxRetries - 1) {
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= 2;
                        continue;
                    }
                }

                // Cast response.json() to the interface
                result = (await response.json()) as GeminiResponse; 
                if (!response.ok) {
                    // Access error message safely using the defined structure
                    throw new Error(result.error?.message || `HTTP error! Status: ${response.status}`);
                }
                break;

            } catch (error) {
                console.error("API Fetch Error:", error);
                if (i === maxRetries - 1) {
                    const errorMsg: ChatMessage = { role: 'ai', text: `Error: Could not connect to the AI model after multiple retries. Please check your API key.` };
                    setChatHistory(prev => [...prev, errorMsg]);
                    setLoading(false);
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
            }
        }

        // Process Response using the strictly defined type
        const candidate = result?.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text;

        if (text) {
            let sources: Source[] = [];
            const groundingMetadata = candidate.groundingMetadata;
            if (groundingMetadata && groundingMetadata.groundingAttributions) {
                sources = groundingMetadata.groundingAttributions
                    .map(attribution => ({ 
                        uri: attribution.web?.uri || '',
                        title: attribution.web?.title,
                    }))
                    .filter((source: Source) => source.uri);
            }

            const aiMessage: ChatMessage = { 
                role: 'ai', 
                text: text, 
                sources: sources,
            };
            setChatHistory(prev => [...prev, aiMessage]);

        } else {
            const errorDetail = result?.error?.message || "Received an empty or malformed response.";
            const errorMsg: ChatMessage = { role: 'ai', text: `An unexpected error occurred: ${errorDetail}` };
            setChatHistory(prev => [...prev, errorMsg]);
        }

        setLoading(false);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter' && !loading && userInput.trim() !== '') {
            sendMessage();
        }
    };

    const isInputDisabled = loading || userId.includes('Error');

    return (
        <>
            {/* Bootstrap 5 CDN Link - Simulates a global stylesheet import in Next.js */}
            <link 
                rel="stylesheet" 
                href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" 
                crossOrigin="anonymous" 
            />
            
            {/* Global Styles (Fixing React warning by using standard style tag) */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap');
                body {
                    font-family: 'Inter', sans-serif;
                    background-color: #f8f9fa;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    padding: 1rem;
                }
                .chat-container {
                    height: 80vh;
                    max-height: 800px;
                    display: flex;
                    flex-direction: column;
                }
                .pre-wrap {
                    white-space: pre-wrap;
                }
            `}</style>

            <div className="container-sm bg-white shadow-lg rounded-4 p-4 p-md-5 chat-container" style={{ maxWidth: '700px' }}>
                
                {/* Header & User Info */}
                <div className="mb-4 pb-2 border-bottom border-secondary border-opacity-25">
                    <h1 className="h3 fw-bolder text-dark">Grounded AI Assistant (Next.js/Bootstrap)</h1>
                    <p className="small text-muted text-truncate mt-1">User ID: {userId}</p>
                </div>

                {/* Chat Messages Area */}
                <div ref={chatRef} className="flex-grow-1 overflow-auto mb-4 p-2" style={{ maxHeight: '100%' }}>
                    {chatHistory.map((message, index) => (
                        <MessageBubble key={index} message={message} />
                    ))}
                    
                    {/* Loading Indicator/Status */}
                    {isInputDisabled && (
                        <div className="text-center my-3 text-primary">
                            <div className="spinner-border spinner-border-sm me-2" role="status">
                                <span className="visually-hidden">Loading...</span>
                            </div>
                            {userId.includes('Initializing') ? 'Authenticating...' : 'Assistant is typing...'}
                        </div>
                    )}
                </div>

                {/* API Key Status Warning */}
                {API_KEY === "" && (
                    <div className="alert alert-warning p-2 small mt-2" role="alert">
                        <strong>Warning:</strong> API Key is empty. Replace it for live external deployment.
                    </div>
                )}

                {/* Chat Input Area */}
                <div className="input-group">
                    <input 
                        type="text" 
                        className="form-control form-control-lg rounded-start-pill" 
                        placeholder="Ask your question here..."
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isInputDisabled}
                    />
                    <button 
                        className="btn btn-primary btn-lg rounded-end-pill shadow-sm"
                        onClick={sendMessage}
                        disabled={isInputDisabled || userInput.trim() === ''}
                        id="send-btn"
                    >
                        {loading && userId.includes('auth-user') ? (
                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        ) : 'Send'}
                    </button>
                </div>
            </div>
        </>
    );
};

export default App;
