import { NextRequest, NextResponse } from 'next/server';

// SWITCHED MODEL: Using the free Gemini model for image generation
const IMAGE_MODEL = 'gemini-2.5-flash-image-preview';
// This model uses the standard generateContent endpoint, not the specialized :predict endpoint
const IMAGE_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`;

/**
 * POST Handler for Image Generation.
 * This route securely handles the Image API call using the server-side API key.
 */
export async function POST(request: NextRequest) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ 
            error: "API Key not configured for image generation. Please set the GEMINI_API_KEY environment variable." 
        }, { status: 500 });
    }

    try {
        // The request body contains the prompt and parameters (which we need to reformat for Gemini)
        const { instances } = await request.json();
        const userPrompt = instances?.prompt; // Extract the prompt string

        if (!userPrompt) {
            return NextResponse.json({ error: "Missing image generation prompt." }, { status: 400 });
        }

        // Construct the payload for the Gemini Image API call
        const geminiImagePayload = {
            contents: [{
                parts: [{ text: userPrompt }]
            }],
            generationConfig: {
                // MANDATORY: Tells Gemini to return an image modality part
                responseModalities: ['IMAGE'], 
            },
        };

        const response = await fetch(`${IMAGE_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiImagePayload)
        });

        // Forward the response data and status back to the client
        const data = await response.json();
        
        return NextResponse.json(data, { 
            status: response.status 
        });

    } catch (e: unknown) {
        const errorMsg = e instanceof Error ? e.message : "Internal server error during image generation API call.";
        console.error("Image API Error:", errorMsg);
        return NextResponse.json({ error: errorMsg }, { status: 500 });
    }
}
