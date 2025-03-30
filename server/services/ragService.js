import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const SOURCE_URLS = [
  'https://www.canada.ca/en/department-national-defence/services/benefits-military/pay-pension-benefits/benefits/canadian-forces-temporary-duty-travel-instructions.html',
  'https://www.njc-cnm.gc.ca/directive/d10/v238/en?print'
];
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY environment variable is not set.');
  // In a real application, you might want to throw an error or exit
  // process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "models/text-embedding-004" });

const DEFAULT_TOP_N = 5;

// --- In-Memory Cache ---
// Simple cache for processed text chunks and their embeddings.
// Replace with a more robust solution (e.g., Redis, Vector DB) for production.
let documentChunks = []; // Stores { id: string, text: string, embedding: number[], sourceUrl: string, sourceTitle: string }
let isInitialized = false;
let lastUpdateTime = null;

// --- Content Fetching & Processing ---

/**
 * Fetches HTML content from a specific URL.
 * @param {string} url The URL to fetch content from.
 * @returns {Promise<string>} The HTML content as a string.
 * @throws {Error} If fetching fails.
 */
async function fetchSourceContent(url) {
    try {
        console.log(`Fetching content from ${url}...`);
        const response = await axios.get(url, {
            headers: {
                // Set a user-agent to be polite
                'User-Agent': 'RooChatbot/1.0 (+https://github.com/your-repo)'
            },
            timeout: 15000 // 15 second timeout
        });
        console.log(`Successfully fetched content (Status: ${response.status}).`);
        return response.data;
    } catch (error) {
        console.error(`Error fetching content from ${url}:`, error.message);
        if (error.response) {
            console.error(`Status: ${error.response.status}, Data: ${error.response.data}`);
        }
        throw new Error(`Failed to fetch source content: ${error.message}`);
    }
}

/**
 * Parses HTML to extract relevant text content using Cheerio.
 * Attempts to target the main content area of the Canada.ca page.
 * NOTE: This selector is brittle and depends on the website structure.
 * @param {string} html The HTML content.
 * @returns {{text: string, title: string}} An object containing the extracted plain text and the page title.
 */
function parseHtmlContent(html) {
    console.log('Parsing HTML content...');
    const $ = cheerio.load(html);
    const title = $('title').first().text() || 'Untitled Document'; // Extract title, provide fallback

    // Target the main content area - this selector might need adjustment!
    // Inspecting the page (as of late March 2025), the main content seems
    // to be within <main property="mainContentOfPage">...</main>
    const mainContent = $('main[property="mainContentOfPage"]');

    if (!mainContent.length) {
        console.warn("Could not find the main content element ('main[property=\"mainContentOfPage\"]'). Falling back to body.");
        // Fallback: try extracting text from the whole body, excluding script/style
        $('script, style, nav, footer, header, aside').remove();
        // Fallback: try extracting text from the whole body, excluding script/style
        const fallbackText = $('body').text().replace(/\s\s+/g, ' ').trim();
        console.log(`Parsed HTML (fallback), extracted ~${fallbackText.length} characters.`);
        return { text: fallbackText, title: title };
    }

    // Remove elements that are likely not part of the core instructions
    mainContent.find('script, style, nav, footer, header, aside, .breadcrumb, .gc-subway-menu, details.hidden-print').remove();

    // Extract text, clean up whitespace, and join paragraphs
    const text = mainContent.text()
        .replace(/(\r\n|\n|\r)/gm, "\n") // Normalize line breaks
        .replace(/\n\s*\n/g, '\n\n') // Consolidate multiple blank lines
        .replace(/\s\s+/g, ' ') // Consolidate multiple spaces
        .trim();

    console.log(`Parsed HTML, extracted ~${text.length} characters. Title: "${title}"`);
    return { text, title };
}

/**
 * Splits the text into smaller chunks with a target size and overlap.
 * Attempts to split at sentence boundaries or paragraphs first.
 * @param {string} text The full extracted text.
 * @param {number} [targetChunkSize=1500] Target characters per chunk.
 * @param {number} [overlapSize=150] Characters to overlap between chunks.
 * @returns {string[]} An array of text chunks.
 */
function chunkText(text, targetChunkSize = 1000, overlapSize = 100) {
    console.log(`Chunking text with target size ~${targetChunkSize} chars and overlap ${overlapSize} chars...`);
    const chunks = [];
    let startIndex = 0;

    // Ensure overlap is smaller than target chunk size
    overlapSize = Math.min(overlapSize, targetChunkSize / 2);

    while (startIndex < text.length) {
        let endIndex = Math.min(startIndex + targetChunkSize, text.length);

        // If we're not at the end of the text, try to find a better split point
        if (endIndex < text.length) {
            let bestSplitPoint = -1;

            // Prioritize paragraph breaks near the target end
            let paragraphBreak = text.lastIndexOf('\n\n', endIndex);
            if (paragraphBreak > startIndex + overlapSize) { // Ensure break is after potential overlap start
                 bestSplitPoint = paragraphBreak + 2; // Include the newlines in the previous chunk
            }

            // If no paragraph break, look for sentence endings
            if (bestSplitPoint === -1) {
                 const sentenceEndings = ['.', '!', '?'];
                 let nearestSentenceEnd = -1;
                 for (const ending of sentenceEndings) {
                     const pos = text.lastIndexOf(ending, endIndex);
                     // Ensure the sentence end is reasonably close and after the start
                     if (pos > startIndex + overlapSize && pos > nearestSentenceEnd) {
                        nearestSentenceEnd = pos;
                     }
                 }
                 if (nearestSentenceEnd !== -1) {
                    bestSplitPoint = nearestSentenceEnd + 1; // Include the punctuation
                 }
            }

            // If we found a good split point, use it
            if (bestSplitPoint !== -1) {
                endIndex = bestSplitPoint;
            }
            // If no good split point found within range, just cut at targetChunkSize
            // (This prevents infinite loops if a sentence is longer than targetChunkSize)
        }

        const chunk = text.substring(startIndex, endIndex).trim();

        // Only add non-empty chunks
        if (chunk.length > 0) {
            chunks.push(chunk);
        }

        // Move startIndex for the next chunk, considering overlap
        startIndex = Math.max(startIndex + 1, endIndex - overlapSize); // Ensure progress even with tiny chunks/large overlap

        // Safety break to prevent infinite loops in edge cases
        if (startIndex >= endIndex) {
             console.warn("Chunking loop potential issue: startIndex >= endIndex. Breaking loop.", {startIndex, endIndex, chunkLength: chunk.length});
             break;
        }
    }

    console.log(`Split text into ${chunks.length} chunks.`);
    return chunks.filter(chunk => chunk.length > 10); // Final filter for very small chunks
}

// --- Embedding & Similarity ---

/**
 * Calculates the dot product of two vectors.
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number} The dot product.
 * @throws {Error} If vectors have different lengths.
 */
function dotProduct(vecA, vecB) {
    if (vecA.length !== vecB.length) {
        throw new Error("Vectors must have the same length for dot product.");
    }
    let product = 0;
    for (let i = 0; i < vecA.length; i++) {
        product += vecA[i] * vecB[i];
    }
    return product;
}

/**
 * Calculates the magnitude (Euclidean norm) of a vector.
 * @param {number[]} vec
 * @returns {number} The magnitude.
 */
function magnitude(vec) {
    let sumOfSquares = 0;
    for (let i = 0; i < vec.length; i++) {
        sumOfSquares += vec[i] * vec[i];
    }
    return Math.sqrt(sumOfSquares);
}

/**
 * Calculates the cosine similarity between two vectors.
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number} Cosine similarity score (between -1 and 1).
 */
function cosineSimilarity(vecA, vecB) {
    const magA = magnitude(vecA);
    const magB = magnitude(vecB);
    if (magA === 0 || magB === 0) {
        return 0; // Handle zero vectors
    }
    return dotProduct(vecA, vecB) / (magA * magB);
}


/**
 * Finds the top N most similar text chunks to a query embedding.
 * Uses cosine similarity for comparison.
 * @param {number[]} queryEmbedding The embedding of the user's query.
 * @param {number} [topN=5] The number of top results to return.
 * @returns {Array<{id: string, text: string, score: number, sourceUrl: string, sourceTitle: string}>} Sorted array of similar chunks.
 */
function findSimilarChunks(queryEmbedding, topN = DEFAULT_TOP_N) {
    if (!isInitialized || documentChunks.length === 0) {
        console.warn('RAG service not initialized or no chunks available.');
        return [];
    }
    console.log(`Finding top ${topN} similar chunks...`);

    const similarities = documentChunks.map(chunk => ({
        id: chunk.id,
        text: chunk.text,
        score: cosineSimilarity(queryEmbedding, chunk.embedding),
        sourceUrl: chunk.sourceUrl,
        sourceTitle: chunk.sourceTitle
    }));

    // Sort by score descending
    similarities.sort((a, b) => b.score - a.score);

    console.log(`Found ${similarities.length} chunks, returning top ${Math.min(topN, similarities.length)}.`);
    return similarities.slice(0, topN);
}

// Helper function to embed a single chunk with retry logic, now takes chunkData object
async function embedSingleChunkWithRetry(chunkData, embeddingModel) {
    // Destructure necessary info from chunkData
    const { id, text, sourceUrl, sourceTitle } = chunkData;
    console.log(`Embedding chunk ${id} (Source: ${sourceUrl})...`);
    let result;
    let retries = 3;
    while (retries > 0) {
        try {
            result = await embeddingModel.embedContent(text);
            // Success
            return {
                id: id, // Use the pre-generated ID
                text: text,
                sourceUrl: sourceUrl,
                sourceTitle: sourceTitle,
                embedding: result.embedding.values
            };
        } catch (error) {
            retries--;
            console.warn(`Embedding failed for chunk ${id} (Source: ${sourceUrl}, Retries left: ${retries}). Error: ${error.message}`);
            if (retries === 0) {
                // Log the full error object for more details on final failure
                console.error(`Failed to embed chunk ${id} after retries: "${text.substring(0, 50)}..."`, error);
                // Re-throw the error to indicate final failure for this chunk
                throw error;
            }
            // Simple backoff
            await new Promise(resolve => setTimeout(resolve, 1000 * (3 - retries)));
        }
    }
    // Should not be reachable if retry logic is correct
    throw new Error(`Embedding failed unexpectedly for chunk ${id}`);
}

/**
 * Generates embeddings for an array of text chunks using the Gemini API.
 * Processes chunks in parallel with a concurrency limit and retry logic.
 * @param {Array<{id: string, text: string, sourceUrl: string, sourceTitle: string}>} chunkDataList Array of chunk data objects.
 * @returns {Promise<Array<{id: string, text: string, embedding: number[], sourceUrl: string, sourceTitle: string}>>} Array of successfully embedded chunks, preserving original relative order.
 */
async function embedChunks(chunkDataList) {
    console.log(`Generating embeddings for ${chunkDataList.length} chunks...`);
    if (chunkDataList.length === 0) {
        return [];
    }

    // Ensure embeddingModel is accessible (assuming it's defined in the outer scope)
    // The model is initialized at the top level (line 18), so it should be available here.
    if (!embeddingModel) {
        console.error("Embedding model is not initialized.");
        throw new Error("Embedding model not available");
    }

    const concurrencyLimit = 15;
    const results = new Array(chunkDataList.length); // To store results/nulls in order
    let promisesInFlight = 0;
    let currentIndex = 0;
    // We don't strictly need to track allTaskPromises unless we want Promise.allSettled later
    // const allTaskPromises = [];

    // Using a simplified async queue approach
    await new Promise((resolveOuter) => {
        const runNext = async () => {
            // Check if we should stop recursing/looping
            if (currentIndex >= chunkDataList.length && promisesInFlight === 0) {
                resolveOuter(); // All tasks are launched and completed
                return;
            }

            // Launch new tasks while below concurrency limit and chunks remain
            while (promisesInFlight < concurrencyLimit && currentIndex < chunkDataList.length) {
                const index = currentIndex++; // Grab the index before async operation
                promisesInFlight++;

                // No need to track the promise separately if just using the count
                // Start the task, don't await it here
                 embedSingleChunkWithRetry(chunkDataList[index], embeddingModel)
                    .then(result => {
                        results[index] = result; // Store successful result in the correct slot
                    })
                    .catch(error => {
                        // Error is logged within the helper function.
                        results[index] = null; // Mark as failed in the results array
                        // We don't re-throw here, allowing other chunks to continue
                    })
                    .finally(() => {
                        promisesInFlight--;
                        // IMPORTANT: After a task finishes, immediately check if we can launch another
                        runNext();
                    });
            }
            // If the loop finishes (either concurrency limit hit or all chunks launched),
            // the function will wait for tasks to complete via the .finally() calls triggering runNext() again.
        };

        // Start the initial batch of workers/tasks
        runNext();
    });

    // Filter out failed embeddings (marked as null)
    const successfulEmbeddings = results.filter(r => r !== null);
    const failureCount = chunkDataList.length - successfulEmbeddings.length;

    if (failureCount > 0) {
        console.warn(`Finished embedding process. ${successfulEmbeddings.length} chunks succeeded, ${failureCount} chunks failed.`);
    } else {
        console.log(`Finished embedding process. All ${successfulEmbeddings.length} chunks succeeded.`);
    }

    // Return only successful embeddings, maintaining relative order due to pre-allocated array
    return successfulEmbeddings;
}

/**
 * Embeds a single query text.
 * @param {string} queryText The user's query.
 * @returns {Promise<number[]>} The embedding vector.
 * @throws {Error} If embedding fails.
 */
async function embedQuery(queryText) {
    try {
        const result = await embeddingModel.embedContent(queryText);
        return result.embedding.values;
    } catch (error) {
        // Log the full error object for more details (includes message and stack)
        console.error(`Error embedding query: "${queryText}"`, error);
        // Re-throw the original error to preserve stack trace and original error type
        throw error;
    }
}


// --- Initialization & Retrieval ---

/**
 * Initializes the RAG service: fetches, parses, chunks, and embeds content.
 * Stores the results in the in-memory cache.
 * @param {boolean} [forceRefresh=false] - Force refresh even if already initialized.
 */
async function initializeRagService(forceRefresh = false) {
    // Added check for empty SOURCE_URLS
    if (!SOURCE_URLS || SOURCE_URLS.length === 0) {
        console.warn("SOURCE_URLS array is empty. Cannot initialize RAG service.");
        isInitialized = false;
        documentChunks = [];
        return;
    }

    console.log(`initializeRagService: Check - isInitialized=${isInitialized}, forceRefresh=${forceRefresh}`);
    if (isInitialized && !forceRefresh) {
        console.log('initializeRagService: Skipping initialization, already done.');
        return;
    }

    console.log(`Initializing RAG service... (Force refresh: ${forceRefresh})`);
    isInitialized = false; // Mark as initializing
    let allEmbeddedChunks = [];
    let totalSourceCount = SOURCE_URLS.length;
    let processedSourceCount = 0;

    try {
        const processingPromises = SOURCE_URLS.map(async (url) => {
            // Wrap the processing logic for a single URL in an async function
            console.log(`Starting processing for source: ${url}`); // Log start
            try {
                const html = await fetchSourceContent(url);
                const { text, title } = parseHtmlContent(html);
                const textChunks = chunkText(text);
                const chunkDataList = textChunks.map((chunkText, index) => ({
                    id: `${url}#chunk_${index}`,
                    text: chunkText,
                    sourceUrl: url,
                    sourceTitle: title
                }));
                const embeddedChunks = await embedChunks(chunkDataList); // This already handles concurrency for embedding *within* a source
                console.log(`Successfully processed source: ${url}, got ${embeddedChunks.length} chunks.`); // Log success
                return embeddedChunks; // Return the chunks for this URL
            } catch (sourceError) {
                console.error(`Failed to process source ${url}:`, sourceError.message);
                // Re-throw the error to be captured by allSettled's status
                throw sourceError;
            }
        });

        console.log(`Waiting for ${processingPromises.length} sources to be processed in parallel...`);
        const results = await Promise.allSettled(processingPromises);

        allEmbeddedChunks = []; // Reset here before collecting results
        let successfulSourceCount = 0;
        let failedSourceCount = 0;
        totalSourceCount = SOURCE_URLS.length; // Ensure totalSourceCount is accurate

        results.forEach((result, index) => {
            const url = SOURCE_URLS[index]; // Get corresponding URL
            if (result.status === 'fulfilled') {
                // console.log(`Source processing succeeded for: ${url}`); // Keep console less verbose
                allEmbeddedChunks = allEmbeddedChunks.concat(result.value);
                successfulSourceCount++;
            } else {
                // Log the reason for failure, accessing the message property if it exists
                console.error(`Source processing failed for: ${url}. Reason:`, result.reason?.message || result.reason);
                failedSourceCount++;
            }
        });

        // Use the counts derived from results instead of processedSourceCount
        processedSourceCount = successfulSourceCount; // Update processedSourceCount for the final log message

        documentChunks = allEmbeddedChunks; // Assign combined chunks to the cache
        lastUpdateTime = new Date();
        isInitialized = true;
        console.log(`RAG service initialization finished. ${successfulSourceCount} sources succeeded, ${failedSourceCount} sources failed. Total chunks: ${documentChunks.length}. Last update: ${lastUpdateTime.toISOString()}`);
    } catch (error) {
        // This catch block handles errors *before* or *during* the Promise.allSettled setup,
        // not errors from individual source processing (which are handled above).
        console.error('initializeRagService: CRITICAL FAILURE during initialization setup:', {
            message: error.message,
            stack: error.stack,
            cause: error.cause // Include cause if available
        });
        // Keep potentially stale data if initialization fails? Or clear it?
        // documentChunks = []; // Option: Clear cache on failure
        isInitialized = false; // Ensure it's marked as not initialized on failure
    }
}

/**
 * Retrieves relevant chunks for a given query and provides a de-duplicated list of their sources.
 * @param {string} query The user's query text.
 * @param {number} [topN=5] Number of chunks to retrieve.
 * @returns {Promise<{chunks: Array<{id: string, text: string, score: number, sourceUrl: string, sourceTitle: string}>, sources: Array<{url: string, title: string}>}>} An object containing the relevant chunks and a unique list of their sources.
 */
async function retrieveChunks(query, topN = DEFAULT_TOP_N) {
    console.log(`retrieveChunks: Called with query: "${query.substring(0, 50)}...", topN: ${topN}`);
    if (!isInitialized) {
        console.warn('retrieveChunks: WARNING - RAG service is not initialized. Returning empty.');
        // Optional: Try initializing on demand, but this adds latency to the first request.
        // await initializeRagService();
        // if (!isInitialized) return { chunks: [], sources: [] }; // Still failed
        return { chunks: [], sources: [] }; // Return consistent empty structure
    }

    try {
        const queryEmbedding = await embedQuery(query);
        const similarChunks = findSimilarChunks(queryEmbedding, topN);
        // De-duplicate sources based on sourceUrl, preserving order of first appearance
        const uniqueSources = [];
        const seenUrls = new Set();
        for (const chunk of similarChunks) {
            // Ensure sourceUrl exists and hasn't been seen
            if (chunk.sourceUrl && !seenUrls.has(chunk.sourceUrl)) {
                uniqueSources.push({
                    url: chunk.sourceUrl,
                    // Provide a fallback title if sourceTitle is missing or empty
                    title: chunk.sourceTitle || 'Untitled Source'
                });
                seenUrls.add(chunk.sourceUrl);
            }
        }

        // Return both the chunks and the unique sources
        return {
           chunks: similarChunks,
           sources: uniqueSources
        };
    } catch (error) {
        // Log the full error object for more details (includes message and stack)
        console.error('Error during chunk retrieval process:', error);
        // Return structure consistent with success case on failure
        return { chunks: [], sources: [] };
    }
}

/**
 * Gets the status of the RAG service.
 */
function getStatus() {
    return {
        initialized: isInitialized,
        lastUpdateTime: lastUpdateTime ? lastUpdateTime.toISOString() : null,
        chunkCount: documentChunks.length,
        sourceUrls: SOURCE_URLS, // Corrected variable name to reflect array
    };
}

export {
    initializeRagService,
    retrieveChunks,
    getStatus,
    // Expose embedQuery if needed elsewhere, e.g., for testing
    // embedQuery
};