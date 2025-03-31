import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import faiss from 'faiss-node';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
const EMBEDDING_DIMENSION = 768; // Dimension for text-embedding-004

const DEFAULT_TOP_N = 5;

// --- FAISS Index and Metadata Storage ---
// Calculate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', 'data'); // Use path.resolve for absolute path
const INDEX_FILE_PATH = path.join(DATA_DIR, 'rag_index.faiss');
const METADATA_FILE_PATH = path.join(DATA_DIR, 'rag_metadata.json');

let faissIndex = null; // Will hold the loaded/created FAISS index
let chunkMetadata = []; // Stores { id: string, text: string, sourceUrl: string, sourceTitle: string }
let isInitialized = false;
let lastUpdateTime = null;

// --- Helper Functions for Persistence and Initialization ---

// Helper to load metadata
function loadMetadata() {
    if (fs.existsSync(METADATA_FILE_PATH)) {
        console.log(`Loading metadata from ${METADATA_FILE_PATH}`);
        const metadataJson = fs.readFileSync(METADATA_FILE_PATH, 'utf-8');
        try {
            return JSON.parse(metadataJson);
        } catch (e) {
             console.error(`Error parsing metadata file ${METADATA_FILE_PATH}:`, e);
             return []; // Return empty on parse error
        }
    }
    console.log('Metadata file not found, returning empty array.');
    return [];
}

// Helper to save metadata
function saveMetadata(metadata) {
    console.log(`Saving metadata (${metadata.length} items) to ${METADATA_FILE_PATH}...`);
    fs.mkdirSync(DATA_DIR, { recursive: true }); // Ensure directory exists
    fs.writeFileSync(METADATA_FILE_PATH, JSON.stringify(metadata, null, 2), 'utf-8');
    console.log('Metadata saved successfully.');
    lastUpdateTime = new Date(); // Update timestamp
}

// Helper to load FAISS index
function loadIndex() {
    if (fs.existsSync(INDEX_FILE_PATH)) {
        console.log(`Loading FAISS index from ${INDEX_FILE_PATH}`);
        try {
           return faiss.IndexFlatL2.read(INDEX_FILE_PATH);
        } catch(e) {
            console.error(`Error reading FAISS index file ${INDEX_FILE_PATH}:`, e);
            // If reading fails, maybe delete the corrupted index? Or handle differently.
            // For now, return null indicating failure to load.
            try {
                console.warn(`Attempting to delete potentially corrupt index file: ${INDEX_FILE_PATH}`);
                fs.unlinkSync(INDEX_FILE_PATH);
            } catch (unlinkError) {
                console.error(`Failed to delete potentially corrupt index file: ${unlinkError}`);
            }
            return null;
        }
    }
    console.log('FAISS index file not found, returning null.');
    return null;
}

// Helper to save FAISS index
function saveIndex(index) {
    if (!index) {
        console.error("Attempted to save a null FAISS index.");
        return;
    }
    console.log(`Saving FAISS index (${index.ntotal()} vectors) to ${INDEX_FILE_PATH}...`);
    fs.mkdirSync(DATA_DIR, { recursive: true }); // Ensure directory exists
    try {
        index.write(INDEX_FILE_PATH);
        console.log('FAISS index saved successfully.');
        lastUpdateTime = new Date(); // Update timestamp
    } catch (e) {
         console.error(`Error writing FAISS index file ${INDEX_FILE_PATH}:`, e);
         throw new Error(`Failed to save FAISS index: ${e.message}`); // Rethrow to signal failure
    }
}

// Helper to ensure service is initialized (simplified version for admin tasks)
// Ensures faissIndex and chunkMetadata are loaded or initialized as empty.
async function ensureInitialized() {
    // Avoid re-running if already initialized and objects exist
    if (isInitialized && faissIndex && chunkMetadata) {
        // console.log("ensureInitialized: Already initialized and objects exist.");
        return;
    }

    console.log("Service not fully initialized or objects missing, ensuring index and metadata are loaded/created...");
    // Prioritize loading existing data
    faissIndex = loadIndex();
    chunkMetadata = loadMetadata();

    if (faissIndex && chunkMetadata.length > 0 && faissIndex.ntotal() !== chunkMetadata.length) {
         console.warn(`ensureInitialized: Mismatch between FAISS index size (${faissIndex.ntotal()}) and metadata count (${chunkMetadata.length}). Data might be corrupted. Index will be kept, but metadata might be out of sync.`);
         // Decide how to handle mismatch - rebuild? For now, log and proceed cautiously.
    }

    // If index doesn't exist or failed to load, create a new empty one in memory
    if (!faissIndex) {
        console.log("ensureInitialized: Creating new empty FAISS index in memory.");
        faissIndex = new faiss.IndexFlatL2(EMBEDDING_DIMENSION);
        // If index is new, metadata should also be considered empty/new
        if (chunkMetadata.length > 0) {
             console.warn("ensureInitialized: New index created, but existing metadata found. Clearing metadata for consistency.");
             chunkMetadata = [];
        }
    }

    // Mark as initialized because we have *some* state (even if empty)
    isInitialized = true;
    lastUpdateTime = fs.existsSync(INDEX_FILE_PATH) ? new Date(fs.statSync(INDEX_FILE_PATH).mtime) : new Date();
    console.log(`Service initialization check complete. Index vectors: ${faissIndex?.ntotal() ?? 0}, Metadata items: ${chunkMetadata?.length ?? 0}`);

    // Final safety check: ensure faissIndex is an object, not null
    if (!faissIndex) {
       console.error("ensureInitialized: CRITICAL - faissIndex is still null after initialization logic. Creating empty index.");
       faissIndex = new faiss.IndexFlatL2(EMBEDDING_DIMENSION);
    }
     // Final safety check: ensure chunkMetadata is an array
    if (!Array.isArray(chunkMetadata)) {
        console.error("ensureInitialized: CRITICAL - chunkMetadata is not an array after initialization logic. Resetting to empty array.");
        chunkMetadata = [];
    }
}


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
 * @param {number} [targetChunkSize=1000] Target characters per chunk.
 * @param {number} [overlapSize=100] Characters to overlap between chunks.
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

// --- Embedding ---

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
 * Initializes the RAG service: Loads the FAISS index and metadata if they exist,
 * otherwise fetches, parses, chunks, embeds content, and builds/saves them.
 * @param {boolean} [forceRefresh=false] - Force refresh even if already initialized.
 */
async function initializeRagService(forceRefresh = false) {
    // Added check for empty SOURCE_URLS
    if (!SOURCE_URLS || SOURCE_URLS.length === 0) {
        console.warn("SOURCE_URLS array is empty. Cannot initialize RAG service.");
        isInitialized = false;
        faissIndex = null;
        chunkMetadata = [];
        return;
    }

    console.log(`initializeRagService: Check - isInitialized=${isInitialized}, forceRefresh=${forceRefresh}`);
    if (isInitialized && !forceRefresh) {
        console.log('initializeRagService: Skipping initialization, already done.');
        return;
    }

    console.log(`Initializing RAG service... (Force refresh: ${forceRefresh})`);
    isInitialized = false; // Mark as initializing

    try {
        // Check if index and metadata files exist
        const indexExists = fs.existsSync(INDEX_FILE_PATH);
        const metadataExists = fs.existsSync(METADATA_FILE_PATH);

        if (indexExists && metadataExists && !forceRefresh) {
            // Use helper functions now
            faissIndex = loadIndex();
            chunkMetadata = loadMetadata(); // Handles file not found and parse errors

             // Check if loading succeeded and if counts match
            if (!faissIndex) {
                 console.error("initializeRagService: Failed to load existing FAISS index. Forcing rebuild.");
                 await initializeRagService(true); // Recurse with forceRefresh
                 return;
            }

            if (faissIndex.ntotal() !== chunkMetadata.length) {
                console.warn(`Mismatch between FAISS index size (${faissIndex.ntotal()}) and metadata count (${chunkMetadata.length}). Data might be corrupted. Consider refreshing.`);
                // Optionally force a rebuild here, or just log the warning
                // For now, we proceed but this indicates a potential issue.
            } else {
                console.log(`Successfully loaded index with ${faissIndex.ntotal()} vectors and corresponding metadata.`);
            }
            lastUpdateTime = new Date(fs.statSync(INDEX_FILE_PATH).mtime); // Use file modification time
            isInitialized = true;
        } else {
            console.log('Building new FAISS index and metadata (or forceRefresh=true)...');
            if (forceRefresh) {
                console.log("Force refresh requested.");
            }
            if (!indexExists) console.log(`Reason: Index file not found at ${INDEX_FILE_PATH}`);
            if (!metadataExists) console.log(`Reason: Metadata file not found at ${METADATA_FILE_PATH}`);

            // --- Fetch, Parse, Chunk, Embed ---
            let allEmbeddedChunks = [];
            let totalSourceCount = SOURCE_URLS.length;

            const processingPromises = SOURCE_URLS.map(async (url) => {
                console.log(`Starting processing for source: ${url}`);
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
                    const embeddedChunks = await embedChunks(chunkDataList);
                    console.log(`Successfully processed source: ${url}, got ${embeddedChunks.length} chunks.`);
                    return embeddedChunks;
                } catch (sourceError) {
                    console.error(`Failed to process source ${url}:`, sourceError.message);
                    throw sourceError; // Let Promise.allSettled catch this
                }
            }); // End of processingPromises map

            console.log(`Waiting for ${processingPromises.length} sources to be processed in parallel...`);
            const results = await Promise.allSettled(processingPromises);

            allEmbeddedChunks = [];
            let successfulSourceCount = 0;
            let failedSourceCount = 0;

            results.forEach((result, index) => {
                const url = SOURCE_URLS[index];
                if (result.status === 'fulfilled') {
                    allEmbeddedChunks = allEmbeddedChunks.concat(result.value);
                    successfulSourceCount++;
                } else {
                    console.error(`Source processing failed for: ${url}. Reason:`, result.reason?.message || result.reason);
                    failedSourceCount++;
                }
            });

            console.log(`Embedding process finished. ${successfulSourceCount} sources succeeded, ${failedSourceCount} sources failed. Total successful chunks: ${allEmbeddedChunks.length}.`);

            if (allEmbeddedChunks.length === 0) {
                console.error("No chunks were successfully embedded. Cannot build FAISS index.");
                isInitialized = false; // Remain uninitialized
                faissIndex = null;
                chunkMetadata = [];
                return; // Exit initialization early
            }

            // --- Build FAISS Index ---
            console.log(`Building FAISS index (Dimension: ${EMBEDDING_DIMENSION})...`);
            faissIndex = new faiss.IndexFlatL2(EMBEDDING_DIMENSION);

            // Prepare embeddings and metadata
            chunkMetadata = []; // Reset metadata
            const embeddings = [];
            for (const chunk of allEmbeddedChunks) {
                chunkMetadata.push({
                    id: chunk.id,
                    text: chunk.text,
                    sourceUrl: chunk.sourceUrl,
                    sourceTitle: chunk.sourceTitle
                });
                embeddings.push(...chunk.embedding); // Flatten embeddings for FAISS
            }

             console.log(`Adding ${allEmbeddedChunks.length} vectors to the index...`);
            faissIndex.add(embeddings); // Pass the flat JS Array directly
            console.log(`FAISS index built. Total vectors: ${faissIndex.ntotal()}`);

            // --- Save Index and Metadata ---
            try {
                console.log(`Ensuring data directory exists: ${DATA_DIR}`);
                fs.mkdirSync(DATA_DIR, { recursive: true });

                // Use helper functions now
                saveIndex(faissIndex);
                saveMetadata(chunkMetadata);

                console.log("Index and metadata saved successfully.");
                lastUpdateTime = new Date();
                isInitialized = true;

            } catch (saveError) {
                console.error("CRITICAL ERROR: Failed to save FAISS index or metadata:", saveError);
                // Decide on state: maybe keep in-memory index but mark as non-persistent?
                isInitialized = true; // Technically initialized in memory, but saving failed
                console.warn("Service is initialized in memory, but persistence failed.");
            }
        } // End of else block (build index)

        console.log(`RAG service initialization finished. Initialized: ${isInitialized}, Chunks: ${chunkMetadata.length}, Last update: ${lastUpdateTime?.toISOString() ?? 'N/A'}`);

    } catch (error) {
        // This catch block handles errors during the overall initialization flow
        // (e.g., issues setting up file checks, major errors outside source processing/saving logic)
        console.error('initializeRagService: CRITICAL FAILURE during initialization process:', {
            message: error.message,
            stack: error.stack,
            cause: error.cause // Include cause if available
        });
        faissIndex = null; // Clear resources on major failure
        chunkMetadata = [];
        isInitialized = false; // Ensure it's marked as not initialized on failure
        // Optionally delete potentially partial/corrupt files if initialization failed badly
        // try { if(fs.existsSync(INDEX_FILE_PATH)) fs.unlinkSync(INDEX_FILE_PATH); } catch(e){}
        // try { if(fs.existsSync(METADATA_FILE_PATH)) fs.unlinkSync(METADATA_FILE_PATH); } catch(e){}
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
     // Use ensureInitialized to load data if needed
     await ensureInitialized();

     // Check again after trying to initialize
     if (!isInitialized || !faissIndex || faissIndex.ntotal() === 0) { // Check ntotal() for empty index
         console.warn('retrieveChunks: RAG service is not initialized or has no data after check. Returning empty.');
         return { chunks: [], sources: [] };
     }

     // Also check metadata consistency, though ensureInitialized warns about this
     if (!chunkMetadata || chunkMetadata.length === 0 || chunkMetadata.length !== faissIndex.ntotal()) {
         console.warn(`retrieveChunks: Metadata inconsistent or empty (Index: ${faissIndex.ntotal()}, Meta: ${chunkMetadata?.length ?? 0}). Search might yield incomplete results.`);
         // Proceed with search, but be aware metadata might be wrong/missing for found indices
     }

    try {
        // Generate the embedding for the query
        const queryVector = await embedQuery(query); // embedQuery now returns the array directly

        // Corrected Checks: Validate the array itself
        if (!Array.isArray(queryVector)) { // Check if it's actually an array
            console.error('embedQuery did not return a valid embedding array:', queryVector);
            return { chunks: [], sources: [] }; // Return standard empty result
        }

        // Check for empty array (existing logic, now operating on the direct result)
        if (!Array.isArray(queryVector) || queryVector.length === 0) {
            console.warn(`Retrieved query embedding is not a valid, non-empty array (length: ${queryVector?.length}). Returning empty results. Query: "${query.substring(0, 50)}..."`); // Log specific warning
            // If the embedding is empty, we cannot perform a search. Return the standard empty result.
            return { chunks: [], sources: [] };
        }

        console.log(`Searching FAISS index (size: ${faissIndex.ntotal()}) for top ${topN} neighbours...`);
        // Pass the plain JavaScript array directly to FAISS search
        const searchResults = faissIndex.search(queryVector, topN);

        console.log(`FAISS search returned ${searchResults.labels.length} results.`);
        // searchResults contains { distances: Float32Array, labels: Int32Array }
        // labels contains the indices (0-based) of the vectors in the index.

        const similarChunks = [];
        for (let i = 0; i < searchResults.labels.length; i++) {
            const index = searchResults.labels[i];
            const distance = searchResults.distances[i]; // L2 distance, smaller is better
             
            // Check if the index is valid and within bounds of our metadata
            if (index >= 0 && index < chunkMetadata.length) {
                const metadata = chunkMetadata[index];
                similarChunks.push({
                    id: metadata.id,
                    text: metadata.text,
                    score: 1 / (1 + distance), // Convert L2 distance to a similarity score (0 to 1, higher is better)
                    // score: distance, // Alternative: directly return distance (lower is better)
                    sourceUrl: metadata.sourceUrl,
                    sourceTitle: metadata.sourceTitle
                });
            } else {
                console.warn(`FAISS returned invalid index: ${index}. Metadata length: ${chunkMetadata.length}`);
            }
        }
        
        // Handle case where metadata might be shorter than index size after a warning
        if (similarChunks.length < searchResults.labels.length) {
             console.warn(`retrieveChunks: Found ${searchResults.labels.length} results from FAISS, but only ${similarChunks.length} had corresponding metadata.`);
        }

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
 * Note: This status reflects the *initial* configuration sources, not necessarily all sources currently in the index if added via addUrlSource.
 */
function getStatus() {
    // Ensure latest counts are reflected if initialized
    const currentVectorCount = (isInitialized && faissIndex) ? faissIndex.ntotal() : 0;
    const currentChunkCount = (isInitialized && chunkMetadata) ? chunkMetadata.length : 0;

    return {
        initialized: isInitialized,
        lastUpdateTime: lastUpdateTime ? lastUpdateTime.toISOString() : null,
        chunkCount: currentChunkCount, // Use metadata length
        vectorCount: currentVectorCount, // Add actual vector count
        sourceUrls: SOURCE_URLS, // Keep this as the originally configured sources
    };
}


// --- Admin Functions ---

/**
 * Adds a new URL source to the FAISS index and metadata.
 * Fetches, processes, embeds the content, and updates the persistent storage.
 * @param {string} url The URL to add.
 * @returns {Promise<{success: boolean, message: string, chunksAdded: number}>} Result object.
 */
async function addUrlSource(url) {
    console.log(`Admin: addUrlSource called for URL: ${url}`);
    await ensureInitialized(); // Make sure index/metadata are loaded/ready

    // Basic URL validation
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
         return { success: false, message: "Invalid URL provided.", chunksAdded: 0 };
    }

    // Check if URL already exists in metadata to avoid duplicates
    const existingSource = chunkMetadata.find(meta => meta.sourceUrl === url);
    if (existingSource) {
        const message = `URL '${url}' already exists in the metadata. Skipping addition.`;
        console.warn(`Admin: addUrlSource - ${message}`);
        return { success: false, message: message, chunksAdded: 0 };
    }

    try {
        console.log(`Admin: Processing new source: ${url}`);
        const html = await fetchSourceContent(url);
        const { text, title } = parseHtmlContent(html);
        const textChunks = chunkText(text);
        const chunkDataList = textChunks.map((chunkText, index) => ({
            id: `${url}#chunk_${index}`, // Simple ID generation
            text: chunkText,
            sourceUrl: url,
            sourceTitle: title
        }));

        const embeddedChunks = await embedChunks(chunkDataList);

        if (!embeddedChunks || embeddedChunks.length === 0) {
            throw new Error(`No chunks were successfully embedded for URL: ${url}`);
        }

        console.log(`Admin: Successfully embedded ${embeddedChunks.length} chunks for ${url}.`);

        // Prepare embeddings and new metadata entries
        const newEmbeddings = [];
        const newMetadataEntries = [];
        for (const chunk of embeddedChunks) {
            newMetadataEntries.push({
                id: chunk.id,
                text: chunk.text,
                sourceUrl: chunk.sourceUrl,
                sourceTitle: chunk.sourceTitle
            });
            newEmbeddings.push(...chunk.embedding); // Flatten embeddings
        }

        // Add to in-memory index and metadata
        console.log(`Admin: Adding ${embeddedChunks.length} new vectors to FAISS index...`);
        faissIndex.add(newEmbeddings); // Add new vectors
        chunkMetadata.push(...newMetadataEntries); // Append new metadata

        console.log(`Admin: FAISS index size now ${faissIndex.ntotal()}, Metadata count now ${chunkMetadata.length}`);

        // --- Save updated Index and Metadata ---
        // Important: Save both index and metadata atomically if possible, or at least sequentially.
        // If saving index fails, we might have inconsistent state.
        try {
             saveIndex(faissIndex); // Save the updated index
             saveMetadata(chunkMetadata); // Save the updated metadata
        } catch (saveError) {
             console.error("Admin: CRITICAL ERROR saving index/metadata after adding source:", saveError);
             // Attempt to revert in-memory changes? Difficult.
             // For now, log the error. The in-memory state is updated, but persistence failed.
             // The service might be inconsistent on next load.
             return { success: false, message: `Failed to save updated index/metadata: ${saveError.message}`, chunksAdded: embeddedChunks.length };
        }

        const message = `Successfully added source '${url}' with ${embeddedChunks.length} chunks.`;
        console.log(`Admin: addUrlSource - ${message}`);
        return { success: true, message: message, chunksAdded: embeddedChunks.length };

    } catch (error) {
        const errorMessage = `Failed to add source URL '${url}': ${error.message}`;
        console.error("Admin: addUrlSource - Error:", error);
        return { success: false, message: errorMessage, chunksAdded: 0 };
    }
}

/**
 * Gets the current number of vectors in the FAISS index.
 * @returns {Promise<{success: boolean, count: number, message?: string}>}
 */
async function getVectorCount() {
    await ensureInitialized(); // Ensure index is loaded/ready
    if (!faissIndex) {
        return { success: false, count: 0, message: "FAISS Index is not available." };
    }
    const count = faissIndex.ntotal();
    return { success: true, count: count };
}

/**
 * Gets the list of unique source URLs present in the metadata.
 * @returns {Promise<{success: boolean, sources: Array<{url: string, title: string}>, message?: string}>}
 */
async function getSourceUrls() {
    await ensureInitialized(); // Ensure metadata is loaded
    if (!chunkMetadata) {
         return { success: false, sources: [], message: "Metadata is not available." };
    }

    const uniqueSourcesMap = new Map();
    chunkMetadata.forEach(meta => {
        if (meta.sourceUrl && !uniqueSourcesMap.has(meta.sourceUrl)) {
            uniqueSourcesMap.set(meta.sourceUrl, meta.sourceTitle || 'Untitled Source');
        }
    });

    const sources = Array.from(uniqueSourcesMap, ([url, title]) => ({ url, title }));
    return { success: true, sources: sources };
}

/**
 * Resets the database by deleting the index and metadata files
 * and clearing the in-memory state.
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function resetDatabase() {
    console.warn("Admin: resetDatabase called. Deleting index and metadata files...");
    let indexDeleted = false;
    let metadataDeleted = false;
    let errorMessages = [];

    // Delete index file
    try {
        if (fs.existsSync(INDEX_FILE_PATH)) {
            fs.unlinkSync(INDEX_FILE_PATH);
            console.log(`Admin: Deleted index file: ${INDEX_FILE_PATH}`);
            indexDeleted = true;
        } else {
            console.log(`Admin: Index file not found, nothing to delete: ${INDEX_FILE_PATH}`);
            indexDeleted = true; // Consider it success if not found
        }
    } catch (error) {
        const msg = `Failed to delete index file ${INDEX_FILE_PATH}: ${error.message}`;
        console.error("Admin: resetDatabase -", msg);
        errorMessages.push(msg);
    }

    // Delete metadata file
    try {
        if (fs.existsSync(METADATA_FILE_PATH)) {
            fs.unlinkSync(METADATA_FILE_PATH);
            console.log(`Admin: Deleted metadata file: ${METADATA_FILE_PATH}`);
            metadataDeleted = true;
        } else {
            console.log(`Admin: Metadata file not found, nothing to delete: ${METADATA_FILE_PATH}`);
            metadataDeleted = true; // Consider it success if not found
        }
    } catch (error) {
         const msg = `Failed to delete metadata file ${METADATA_FILE_PATH}: ${error.message}`;
        console.error("Admin: resetDatabase -", msg);
        errorMessages.push(msg);
    }

    // Reset in-memory state regardless of file deletion success/failure
    console.log("Admin: Resetting in-memory state (index, metadata, initialized flag).");
    // Release index resources if it exists before nulling
    // Note: faiss-node might not have an explicit 'free'. Setting to null lets GC handle it.
    // Check specific library docs if explicit cleanup is needed.
    // if (faissIndex && typeof faissIndex.free === 'function') { ... }
    faissIndex = null; // Let ensureInitialized create a new one if needed later
    chunkMetadata = [];
    isInitialized = false; // Mark as uninitialized, needs reloading/rebuilding
    lastUpdateTime = null;

    // Force re-initialization to an empty state immediately
    await ensureInitialized();

    if (indexDeleted && metadataDeleted && errorMessages.length === 0) {
        return { success: true, message: "Database reset successfully. Index and metadata files deleted, in-memory state cleared and re-initialized empty." };
    } else {
        return { success: false, message: `Database reset finished with issues. File deletions - Index: ${indexDeleted}, Metadata: ${metadataDeleted}. Errors: ${errorMessages.join("; ")} In-memory state cleared and re-initialized empty.` };
    }
}


export {
    initializeRagService,
    retrieveChunks,
    getStatus,
    // Admin functions
    addUrlSource,
    getVectorCount,
    getSourceUrls,
    resetDatabase,
    // Expose embedQuery if needed elsewhere, e.g., for testing
    // embedQuery
};