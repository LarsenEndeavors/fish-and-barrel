import { NextRequest, NextResponse } from 'next/server';

// SWITCHED MODEL: Using the free Gemini model for image generation
const IMAGE_MODEL = 'gemini-2.5-flash-image-preview';
// This model uses the standard generateContent endpoint, not the specialized :predict endpoint
const IMAGE_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`;

// --- NEW INTERFACE DEFINITION ---
interface ImageApiResponseBody {
    candidates?: {
        content?: {
            parts?: {
                inlineData?: {
                    mimeType: string;
                    data: string;
                };
            }[];
        };
    }[];
    error?: {
        message: string;
    };
    // Include the possible quota/API error structure here for runtime check
    // This handles cases where the API returns a non-200 status with an error body
    // or a 200 status with a specific error message structure.
    message?: string; 
}
// --------------------------------

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

        const maxRetries = 5;
        let delay = 1000;
        let finalResponse: Response | undefined;
        let finalData: ImageApiResponseBody | undefined; // Using the specific interface now

        for (let i = 0; i < maxRetries; i++) {
            const response = await fetch(`${IMAGE_API_URL}?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(geminiImagePayload)
            });

            finalResponse = response;
            // Ensure we handle JSON parsing safely
            try {
                finalData = await response.json();
            } catch (jsonError) {
                // If parsing fails, treat it as an internal server error
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; 
                    continue;
                }
                finalData = { error: { message: `Failed to parse response from API: ${jsonError}` } };
                break;
            }


            // Check for explicit rate limiting (429) or Quota Exceeded error in the response body
            // Check both error field and top-level message field which can sometimes hold the error string
            const isQuotaError = finalData?.error?.message?.includes("Quota exceeded") || finalData?.message?.includes("Quota exceeded");
            
            if (response.status === 429 || isQuotaError) {
                if (i < maxRetries - 1) {
                    // Implement exponential backoff
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; 
                    continue; // Retry the request
                }
            }
            
            // If the request succeeded, or if it failed for another reason (or max retries reached), break the loop
            break;
        }

        // Forward the final response data and status back to the client
        return NextResponse.json(finalData, { 
            status: finalResponse?.status || 500
        });

    } catch (e: unknown) {
        const errorMsg = e instanceof Error ? e.message : "Internal server error during image generation API call.";
        console.error("Image API Error:", errorMsg);
        return NextResponse.json({ error: errorMsg }, { status: 500 });
    }
}
