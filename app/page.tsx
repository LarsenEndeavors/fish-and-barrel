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

// Interface for the API response structure 
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
                } | undefined;
            }[] | undefined;
        };
    }[];
    error?: {
        message: string;
    };
}

// Interface for Imagen API response structure
interface ImagenResponse {
    predictions?: {
        bytesBase64Encoded: string;
    }[];
}


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
 * Main Application Component (ChatClient) - Client Component for UI and Interaction
 */
const ChatClient = () => {
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
        { role: 'ai', text: "Hello Skathix! I am a grounded AI assistant. Ask me anything, and I will use Google Search to provide up-to-date, sourced information. As a bonus, I'll update the background image based on our conversation's topic!" }
    ]);
    const [userInput, setUserInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [backgroundLoading, setBackgroundLoading] = useState(false);
    const [userId, setUserId] = useState('Initializing...');
    const [backgroundImage, setBackgroundImage] = useState<string>(''); // Base64 image URL
    const chatRef = useRef<HTMLDivElement>(null);
    const [apiKeyExists, setApiKeyExists] = useState(true); 
    const isInitialRender = useRef(true); // Flag to prevent background generation on initial load

    // --- 1. Authentication Setup & API Key Check ---
    useEffect(() => {
        const initializeAuth = async () => {
            try {
                const initialAuthToken = typeof window !== 'undefined' && typeof (window as CustomWindow).__initial_auth_token !== 'undefined' 
                    ? (window as CustomWindow).__initial_auth_token 
                    : null;
                
                let mockUserId = 'anonymous-user-' + Math.random().toString(36).substring(2, 9);
                if (initialAuthToken) {
                    mockUserId = 'auth-user-' + initialAuthToken.substring(0, 8); 
                }
                setUserId(mockUserId);

                try {
                    const checkResponse = await fetch('/api/chat', { method: 'GET' });
                    if (!checkResponse.ok) { 
                        setApiKeyExists(false); 
                    }
                } catch (error) {
                    console.error("API Key Check Error:", error);
                    setApiKeyExists(false); 
                }

                setLoading(false);
            } catch (error) {
                console.error("Initialization Error:", error);
                setUserId('Auth Error');
                setLoading(false);
                setApiKeyExists(false); 
            }
        };

        initializeAuth();
    }, []);

    // --- 2. Dynamic Background Generation Logic ---
    const generateAndSetBackground = async (prompt: string) => {
        setBackgroundLoading(true);

        const imagePrompt = `A stunning, high-definition fantasy illustration for the topic: "${prompt}". Focus on cinematic lighting, epic composition, and painterly detail. Digital art. Cinematic.`;
        const apiKey = ""; // Canvas environment handles the key
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

        const payload = { 
            instances: { prompt: imagePrompt }, 
            parameters: { "sampleCount": 1 } 
        };

        const maxRetries = 3;
        let delay = 1000;
        let base64Data: string | undefined;

        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (response.status === 429) { // Handle rate limiting
                    if (i < maxRetries - 1) {
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= 2;
                        continue;
                    }
                }

                const result: ImagenResponse = await response.json();
                base64Data = result?.predictions?.[0]?.bytesBase64Encoded;

                if (!base64Data) {
                    throw new Error("Received empty or malformed image data.");
                }
                break;
            } catch (error) {
                console.error('Image Generation Error:', error);
                if (i === maxRetries - 1) {
                    console.error("Failed to generate image after retries.");
                    setBackgroundLoading(false);
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
            }
        }
        
        if (base64Data) {
            const imageUrl = `url(data:image/png;base64,${base64Data})`;
            setBackgroundImage(imageUrl);
        }
        setBackgroundLoading(false);
    };

    // --- 3. Apply Background to Body (via style injection) ---
    useEffect(() => {
        if (backgroundImage) {
            // Apply the image URL to the CSS variable in the body style
            document.body.style.setProperty('--dynamic-bg-image', backgroundImage);
        }
    }, [backgroundImage]);

    // --- 4. Auto-scroll effect ---
    useEffect(() => {
        if (chatRef.current) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight;
        }
    }, [chatHistory]);

    // --- 5. Chat Logic: Send Message to API Proxy Route ---
    const sendMessage = async () => {
        const query = userInput.trim();
        const shouldGenerateBg = query.split(/\s+/).length > 3 && !backgroundLoading; // Only generate BG for longer, new queries

        if (!query || loading || !apiKeyExists) return; 

        const newUserMessage: ChatMessage = { role: 'user', text: query };
        setChatHistory(prev => [...prev, newUserMessage]);
        setUserInput('');
        setLoading(true);

        // Start background generation concurrently, if criteria met
        if (shouldGenerateBg) {
            generateAndSetBackground(query);
        }

        // Convert chat history to the format expected by the Gemini API
        const chatMessages = [...chatHistory, newUserMessage].map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }],
        }));

        const payload = {
            contents: chatMessages,
        };

        // Call the local Next.js API route /api/chat
        const apiUrl = '/api/chat'; 

        const maxRetries = 5;
        let delay = 1000;
        let result: GeminiResponse | undefined;

        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                if (response.status === 429) { // Handle rate limiting
                    if (i < maxRetries - 1) {
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= 2;
                        continue;
                    }
                }

                result = (await response.json()) as GeminiResponse;
                if (!response.ok) {
                    throw new Error(result?.error?.message || `HTTP error! Status: ${response.status}`);
                }
                break;

            } catch (error) {
                console.error('API Proxy Fetch Error:', error);
                if (i === maxRetries - 1) {
                    const finalErrorMsg: ChatMessage = { role: 'ai', text: `Error: Could not connect to the API after multiple retries. Please check the server logs.` };
                    setChatHistory(prev => [...prev, finalErrorMsg]);
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
            const groundingMetadata = candidate?.groundingMetadata;
            if (groundingMetadata && groundingMetadata.groundingAttributions) {
                sources = groundingMetadata.groundingAttributions
                    .map(attribution => ({ 
                        uri: attribution.web?.uri || '',
                        title: attribution.web?.title,
                    }))
                    // Filter out sources with empty URIs
                    .filter((source: Source) => source.uri.length > 0); 
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

    const isInputDisabled = loading || userId.includes('Error') || !apiKeyExists;

    return (
        <>
            {/* Bootstrap 5 CDN Link - Simulates a global stylesheet import in Next.js */}
            <link 
                rel="stylesheet" 
                href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" 
                crossOrigin="anonymous" 
            />
            
            {/* Global Styles for Typography and centering - Background handled by globals.css now */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap');
                body {
                    font-family: 'Inter', sans-serif;
                    /* Background styles moved to globals.css for body */
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
                .bg-status-loading {
                    color: #fff;
                    background-color: #0d6efd;
                    padding: 0.25rem 0.75rem;
                    border-radius: 0.5rem;
                }
            `}</style>

            <div className="container-sm bg-white shadow-lg rounded-4 p-4 p-md-5 chat-container" style={{ maxWidth: '700px', zIndex: 1, position: 'relative' }}>
                
                {/* Header & User Info */}
                <div className="mb-4 pb-2 border-bottom border-secondary border-opacity-25">
                    <h1 className="h3 fw-bolder text-dark">Grounded AI Assistant (Secure Next.js)</h1>
                    <div className="d-flex justify-content-between align-items-center mt-1">
                        <p className="small text-muted text-truncate mb-0">User ID: {userId}</p>
                        {backgroundLoading && (
                            <span className="bg-status-loading small fw-semibold">
                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                Generating Background...
                            </span>
                        )}
                    </div>
                </div>

                {/* Chat Messages Area */}
                <div ref={chatRef} className="flex-grow-1 overflow-auto mb-4 p-2" style={{ maxHeight: '100%' }}>
                    {chatHistory.map((message, index) => (
                        <MessageBubble key={index} message={message} />
                    ))}
                    
                    {/* Loading Indicator/Status */}
                    {loading && !userId.includes('Error') && apiKeyExists && (
                        <div className="text-center my-3 text-primary">
                            <div className="spinner-border spinner-border-sm me-2" role="status">
                                <span className="visually-hidden">Loading...</span>
                            </div>
                            {userId.includes('Initializing') ? 'Authenticating...' : 'Assistant is typing...'}
                        </div>
                    )}
                </div>

                {/* API Key Status Warning */}
                {!apiKeyExists && (
                    <div className="alert alert-danger p-2 small mt-2" role="alert">
                        <strong>Configuration Error:</strong> The secret API key is missing or improperly configured on the server. Please set the **`GEMINI_API_KEY`** environment variable.
                    </div>
                )}

                {/* Chat Input Area */}
                <div className="input-group">
                    <input 
                        type="text" 
                        className="form-control form-control-lg rounded-start-pill" 
                        placeholder="Ask your question here (e.g., 'A description of a fearsome fire dragon')..."
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
                        {(loading && userId.includes('auth-user')) ? (
                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        ) : 'Send'}
                    </button>
                </div>
            </div>
        </>
    );
};

// --- Server Component Wrapper (Required by Next.js App Router) ---
const FinalApp = () => {
    // We render the client-side component (ChatClient) inside the Server Component wrapper.
    return (
        <ChatClient />
    );
}

export default FinalApp;
