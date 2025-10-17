import { NextRequest, NextResponse } from 'next/server';

// Interface definitions for clarity (not strictly needed in runtime, but good practice)
interface ChatMessagePart { text: string }
interface ChatMessage { role: 'user' | 'model'; parts: ChatMessagePart[] }
interface GeminiPayload { contents: ChatMessage[] }

/**
 * HEAD Handler
 * Used by the client component to quickly check if the GEMINI_API_KEY is configured.
 * Returns 200 OK if the key is found, or 500 if it is missing.
 */
export async function HEAD(request: NextRequest) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        // Return a 500 Internal Server Error, as a missing critical environment
        // variable is a server misconfiguration error.
        return NextResponse.json({ 
            error: "API Key not configured on the server. Please set the GEMINI_API_KEY environment variable." 
        }, { status: 500 }); 
    }

    // Key exists, success.
    return new NextResponse(null, { status: 200 });
}

/**
 * POST Handler
 * Handles the main chat request, calls the Gemini API, and provides Google Search grounding.
 */
export async function POST(request: NextRequest) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ 
            error: "API Key not configured on the server. Please set the GEMINI_API_KEY environment variable." 
        }, { status: 500 });
    }

    try {
        // Parse the incoming request body (chat history from client)
        const clientPayload: GeminiPayload = await request.json();

        // Construct the payload for the Gemini API call
        const geminiPayload = {
            contents: clientPayload.contents,
            tools: [{ "google_search": {} }], // Enable Google Search Grounding
            systemInstruction: {
                parts: [{ text: "You are a world-class, fact-checked AI assistant. Use Google Search to ground your answers in real-time information. You must cite your sources when using search results." }],
            },
        };

        // Call the Gemini API endpoint
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload)
        });

        // Forward the response data and status back to the client
        const data = await response.json();
        
        return NextResponse.json(data, { 
            status: response.status 
        });

    } catch (e: unknown) {
        const errorMsg = e instanceof Error ? e.message : "Internal server error during Gemini API call.";
        console.error("Gemini API Error:", errorMsg);
        return NextResponse.json({ error: errorMsg }, { status: 500 });
    }
}
