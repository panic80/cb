# AI Chatbot Architecture

## 1. Overview

This document outlines the technical architecture for the AI chatbot integration, based on the requirements specified in `docs/chatbot-requirements.md`. The goal is to create a system that allows users to interact with an AI assistant directly within the application interface.

## 2. Components

The chatbot system will consist of three main components:

### 2.1. Frontend Component

*   **Type:** New React Component
*   **Location:** `src/components/ChatbotWidget.jsx`
*   **Responsibilities:**
    *   Render the chat interface (input field, message display, open/close mechanism).
    *   Manage local UI state (e.g., visibility of the widget, current user input, session's conversation history).
    *   Handle user input and trigger API calls to the backend.
    *   Display responses received from the backend.
    *   Show loading/processing indicators.
*   **Communication:** Uses `fetch` or `axios` to make HTTP POST requests to the backend API endpoint (`/api/v2/chat`).

### 2.2. Backend API Endpoint

*   **Type:** New API Route within the existing Node.js server (`server/main.js` or potentially routed via `server/proxy.js`).
*   **Route:** `/api/v2/chat` (Using `/v2` to avoid potential conflicts with any remnants of the previous chat feature and signify a new version).
*   **Responsibilities:**
    *   Receive chat requests from the frontend.
    *   Perform basic validation/sanitization of the incoming message.
    *   Prepare the request for the chosen AI service (including the user message and potentially a system prompt defining the bot's role, personality, and knowledge base context - see Section 7).
    *   Communicate securely with the AI Service API.
    *   Process the response from the AI Service.
    *   Format and send the reply back to the frontend.
    *   Handle errors gracefully (e.g., AI service unavailability, invalid requests).
*   **Session Management:** For MVP, the backend will be stateless regarding conversation history (history managed client-side). Session IDs might be introduced post-MVP if context needs server-side management.

### 2.3. AI Service Integration

*   **Chosen Service (Recommendation):** Google Gemini API.
    *   *Justification:* Strong conversational capabilities, potential previous familiarity within the project (`gemini.jsx` reference in requirements, `gemini-policy-server` MCP exists), good balance of features and cost. However, the design should allow swapping this with other services (e.g., OpenAI) with moderate effort by encapsulating the interaction logic.
*   **Communication:** The backend server makes secure HTTPS API calls to the Gemini API endpoint.
*   **Authentication:** API Keys for the Gemini service **must** be stored securely as environment variables (e.g., in a `.env` file excluded from Git) on the server and accessed only by the backend process. They must never be exposed to the frontend.
*   **Data Privacy:** The backend should only send the user's message and necessary context (like system prompts) to the AI service. Review Gemini's data usage policies regarding input data. Avoid sending PII.

## 3. Data Flow (Revised for RAG)

*(Diagram assumes content fetching/processing/embedding happens periodically in the background, not during the user request)*

```mermaid
sequenceDiagram
    participant User
    participant Frontend (ChatbotWidget.jsx)
    participant Backend (Node.js /api/v2/chat)
    participant VectorStore (or Processed Content Cache)
    participant AI Service (e.g., Gemini API)

    User->>+Frontend: Types message and sends
    Frontend->>+Backend: POST /api/v2/chat { message: "User Question" }
    Note over Backend: Embed User Question (using Gemini Embedding API)
    Backend->>+VectorStore: Search relevant chunks using question embedding
    VectorStore-->>-Backend: Relevant Text Chunks from Canada.ca content
    Note over Backend: Construct Prompt (User Question + Retrieved Chunks)
    Backend->>+AI Service: Sends prompt to Gemini Generation API
    AI Service-->>-Backend: Returns AI-generated response based on provided context
    Backend->>-Frontend: Sends back { reply: "..." }
    Frontend-->>-User: Displays reply in chat interface
```

## 4. API Specification (`/api/v2/chat`)

*   **Method:** `POST`
*   **Endpoint:** `/api/v2/chat`
*   **Request:**
    *   **Headers:** `Content-Type: application/json`
    *   **Body:**
        ```json
        {
          "message": "string" // Required: The user's message text
        }
        ```
*   **Response (Success - 200 OK):**
    *   **Headers:** `Content-Type: application/json`
    *   **Body:**
        ```json
        {
          "reply": "string" // Required: The chatbot's response text
        }
        ```
*   **Response (Error - e.g., 400 Bad Request, 500 Internal Server Error, 503 Service Unavailable):**
    *   **Headers:** `Content-Type: application/json`
    *   **Body:** (Structure should align with existing server error handling)
        ```json
        {
          "error": "string" // Required: Description of the error
        }
        ```

## 5. Frontend Integration Plan

*   The `ChatbotWidget.jsx` component will be conditionally rendered within a global layout component (e.g., `src/App.jsx` or `src/components/PageLayout.jsx` if suitable).
*   It will likely be rendered with `position: fixed` in a corner (e.g., bottom-right) of the viewport.
*   A separate trigger element (e.g., a floating action button or an icon button in the header/footer) will toggle the visibility of the main chat interface managed by `ChatbotWidget.jsx`.

## 6. Technology Choices & Dependencies

*   **Frontend:** React (Existing)
*   **Backend:** Node.js (Existing)
*   **AI Service:** Google Gemini API (Recommended, includes embedding capabilities)
*   **New Dependencies:**
    *   **Backend:**
        *   `@google/generative-ai`: Official Node.js client library for the Gemini API (Handles generation and potentially embeddings).
        *   `dotenv` (if not already used): To load API keys from environment variables securely.
        *   `cheerio` or `jsdom`: For server-side fetching and parsing of HTML content from the external URL.
        *   *(Potentially)* Libraries for vector storage/search if an in-memory approach proves insufficient (e.g., `langchain`, `llamaindex`, specific vector DB clients - evaluate during implementation based on scale/performance needs).
    *   **Frontend:** No major new dependencies anticipated.

## 7. Knowledge Base Integration (External URL Source via RAG)

*   **Requirement:** The chatbot's knowledge base **must** be derived exclusively from the content available at the following URL: `https://www.canada.ca/en/department-national-defence/services/benefits-military/pay-pension-benefits/benefits/canadian-forces-temporary-duty-travel-instructions.html`. The chatbot must **not** use information from local project files (e.g., `FAQPage.jsx`, `AboutModal.jsx`).
*   **Approach (Retrieval-Augmented Generation - RAG):** To ensure the chatbot answers based *only* on this external content, a RAG approach is necessary:
    1.  **Content Fetching & Processing (Background/Periodic Task Recommended):**
        *   The backend server needs a mechanism (e.g., a scheduled job or triggered process) to periodically fetch the HTML content from the specified URL. Fetching on *every* user request is likely too slow.
        *   The fetched HTML must be parsed using a library (e.g., `cheerio`) to extract the relevant textual content, cleaning out irrelevant elements (menus, sidebars, footers).
        *   The extracted text must be broken down into smaller, semantically meaningful chunks (e.g., paragraphs, sections with headers).
    2.  **Embedding & Storage:**
        *   Each text chunk needs to be converted into a numerical vector embedding using an appropriate model (e.g., Gemini's embedding models via the `@google/generative-ai` library).
        *   These embeddings and their corresponding text chunks must be stored for efficient searching. Options include:
            *   In-memory store (simplest for MVP, if dataset size allows).
            *   A dedicated Vector Database (e.g., Pinecone, ChromaDB, Weaviate - for better scalability, persistence, and advanced search).
    3.  **Retrieval (At Request Time):**
        *   When a user sends a message (`/api/v2/chat`), the backend embeds the user's question using the same embedding model.
        *   This question embedding is used to search the stored vector embeddings to find the most semantically similar text chunks from the Canada.ca content (e.g., top 3-5 chunks).
    4.  **AI Generation (At Request Time):**
        *   The retrieved text chunks are formatted and included as context within the prompt sent to the generative AI model (e.g., Gemini).
        *   The prompt instructs the AI to answer the user's question *based solely* on the provided context (the chunks).
        *   The AI generates the response, which is sent back to the frontend.
*   **Implementation Considerations:**
    *   **Complexity:** This RAG approach is significantly more complex than the initial plan of using static prompts from local files. It requires robust fetching, parsing, chunking, embedding, storage, and retrieval logic.
    *   **Caching:** Effective caching of the fetched/processed/embedded content is crucial for performance and to avoid hammering the external website. Determine an appropriate refresh interval for the content.
    *   **External Dependency:** The system's knowledge is entirely dependent on the availability, structure, and content of the target Canada.ca page. Changes to that page could break the system or lead to outdated information. Monitoring and maintenance are required.
    *   **Latency:** While background processing handles the bulk of the work, the embedding+search step during the request adds latency compared to a simple API call. Optimize retrieval speed.
    *   **Cost:** Embedding API calls and potentially vector database hosting add costs compared to the simpler approach.
    *   **Chunking Strategy:** The effectiveness of RAG heavily depends on how the source text is chunked. Experimentation may be needed.

## 8. Security Considerations Summary

*   Use HTTPS for all communication (Frontend <-> Backend <-> AI Service).
*   Store AI API keys securely via environment variables on the server.
*   Do not collect or prompt for PII.
*   Sanitize/validate inputs where appropriate.
*   Review the AI service's data privacy policy.

## 9. Scope

This document describes the architecture. Implementation details (specific code, detailed error handling logic, UI styling) are outside the scope of this document.