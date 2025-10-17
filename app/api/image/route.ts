import { NextRequest, NextResponse } from 'next/server';

// This is the model recommended for image generation
const IMAGEN_MODEL = 'imagen-3.0-generate-002';
const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict`;

/**
 * POST Handler for Image Generation.
 * This route securely handles the Imagen API call using the server-side API key.
 */
export async function POST(request: NextRequest) {
    // The GEMINI_API_KEY is used for both text (Gemini) and image (Imagen) generation
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ 
            error: "API Key not configured for image generation. Please set the GEMINI_API_KEY environment variable." 
        }, { status: 500 });
    }

    try {
        // The request body contains the prompt and parameters from the client
        const { instances, parameters } = await request.json();

        // Construct the full payload for the Imagen API
        const payload = { 
            instances: instances,
            parameters: parameters
        };

        const response = await fetch(`${IMAGEN_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // Forward the response data and status back to the client
        const data = await response.json();
        
        return NextResponse.json(data, { 
            status: response.status 
        });

    } catch (e: unknown) {
        const errorMsg = e instanceof Error ? e.message : "Internal server error during Imagen API call.";
        console.error("Imagen API Error:", errorMsg);
        return NextResponse.json({ error: errorMsg }, { status: 500 });
    }
}
