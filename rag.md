# Master Prompt: Full-Stack RAG System Implementation

## ROLE AND GOAL

You are an expert full-stack developer specializing in building production-grade AI systems. Your task is to implement a complete Retrieval-Augmented Generation (RAG) pipeline by creating a series of files based on the detailed technical specification provided below. You will work phase by phase, generating one file at a time with its complete, well-commented code.

## PRIMARY CONTEXT: Technical Specification

You will use the following `RAGIMPLEMENT.MD` as your single source of truth for the architecture and implementation details. Adhere to it strictly.

```markdown
# RAG Implementation Plan: LlamaIndex & Qdrant

This document provides a detailed, step-by-step guide for implementing a production-grade Retrieval-Augmented Generation (RAG) system for the chatbot. This plan replaces the previous RAG logic in `ragService.js` with a more robust and scalable architecture using a dedicated Python service powered by LlamaIndex and a Qdrant vector database.

### High-Level Architecture

The new architecture separates the AI/RAG logic from your existing Node.js application.

```mermaid
graph TD
    A[React Frontend] -->|HTTP Request| B(Node.js Backend);
    B -->|/api/v2/chat| C{Python RAG Service (FastAPI)};
    C -->|Vector + Keyword Search| D[Qdrant Vector DB];
    C -->|Embedding & Generation| E[Gemini API];
    C -->|Re-ranking| F[Cohere API];
Phase 1: Environment Setup & System ConfigurationThis phase prepares your development environment and the necessary services for the new Python RAG service.Step 1: Set Up Python EnvironmentIt's best practice to create a new directory for your Python service, for example, rag_service, in the project root.Create and Activate Virtual Environment:# In your project root
mkdir rag_service
cd rag_service
python3 -m venv venv
source venv/bin/activate
Install Required Python Libraries:Create a requirements.txt file in the rag_service directory and add the following:# requirements.txt
llama-index
llama-index-llms-gemini
llama-index-embeddings-gemini
llama-index-vector-stores-qdrant
llama-index-postprocessor-cohere-rerank
qdrant-client
beautifulsoup4
rank_bm25
fastapi
uvicorn
python-dotenv
Then, install the libraries:pip install -r requirements.txt
Step 2: Set Up Qdrant Vector DatabaseQdrant will store your document embeddings for fast retrieval.Run Qdrant via Docker (Easiest Method):docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant
Your Qdrant instance will now be available at http://localhost:6333.Step 3: Configure Environment VariablesCreate a .env file inside your rag_service directory. This will hold your secret keys.# rag_service/.env
GEMINI_API_KEY="YOUR_GOOGLE_AI_API_KEY"
COHERE_API_KEY="YOUR_COHERE_API_KEY"
QDRANT_URL="http://localhost:6333"
Phase 2: The Data Ingestion PipelineThis is a one-time script (ingest.py) you will run to process and index the source content.Step 1: Load and Parse Web DocumentCreate a new file rag_service/ingest.py. This script will fetch the travel instructions and parse the HTML.# rag_service/ingest.py
import os
import qdrant_client
from dotenv import load_dotenv
from llama_index.core import (
    SimpleDirectoryReader,
    VectorStoreIndex,
    StorageContext,
)
from llama_index.core.node_parser import HierarchicalNodeParser, get_leaf_nodes
from llama_index.readers.web import BeautifulSoupWebReader
from llama_index.vector_stores.qdrant import QdrantVectorStore

load_dotenv()

# Load the document from the web
url = "https://www.canada.ca/en/department-national-defence/services/benefits-military/pay-pension-benefits/benefits/canadian-forces-temporary-duty-travel-instructions.html"
documents = BeautifulSoupWebReader().load_data([url])

print("Document loaded successfully.")
Step 2: Implement Hierarchical ChunkingThis will create parent and child nodes to provide both broad context and fine-grained details.# Add to ingest.py
# Create hierarchical chunks
node_parser = HierarchicalNodeParser.from_defaults(
    chunk_sizes=[2048, 512, 128]
)
nodes = node_parser.get_nodes_from_documents(documents)
leaf_nodes = get_leaf_nodes(nodes)
print(f"Created {len(nodes)} total nodes and {len(leaf_nodes)} leaf nodes.")
Step 3: Ingest Data into QdrantThis final step in the script will create the vector embeddings and store them in Qdrant.# Add to ingest.py
# Configure Qdrant and Storage
qdrant_url = os.getenv("QDRANT_URL")
client = qdrant_client.QdrantClient(url=qdrant_url)
vector_store = QdrantVectorStore(client=client, collection_name="cftdti_docs")
storage_context = StorageContext.from_defaults(vector_store=vector_store)

# Store all nodes in the docstore
storage_context.docstore.add_documents(nodes)

print("Ingesting leaf nodes into vector store...")
# Index only the leaf nodes for efficient retrieval
index = VectorStoreIndex(leaf_nodes, storage_context=storage_context)
print("Ingestion complete.")
To run the ingestion pipeline:cd rag_service
source venv/bin/activate
python ingest.py
Phase 3: Retrieval and Generation APICreate a main.py file in rag_service. This will be your FastAPI application.Step 1: Set Up Global ObjectsInitialize the services that will be used by your API endpoints.# rag_service/main.py
import os
import qdrant_client
from dotenv import load_dotenv
from llama_index.core import VectorStoreIndex, get_response_synthesizer
from llama_index.vector_stores.qdrant import QdrantVectorStore
from llama_index.core.retrievers import AutoMergingRetriever
from llama_index.retrievers.bm25 import BM25Retriever
from llama_index.core.postprocessor import CohereRerank
from llama_index.core.query_engine import RetrieverQueryEngine

load_dotenv()

# Initialize Qdrant client and load the index
client = qdrant_client.QdrantClient(url=os.getenv("QDRANT_URL"))
vector_store = QdrantVectorStore(client=client, collection_name="cftdti_docs")
index = VectorStoreIndex.from_vector_store(vector_store=vector_store)

# Configure retrievers for hybrid search
vector_retriever = index.as_retriever(similarity_top_k=5)
bm25_retriever = BM25Retriever.from_defaults(docstore=index.docstore, similarity_top_k=5)

# Configure Auto-Merging Retriever
automerging_retriever = AutoMergingRetriever(
    vector_retriever,
    index.storage_context, # The context with all nodes
    verbose=True
)

# Configure Re-ranker
reranker = CohereRerank(api_key=os.getenv("COHERE_API_KEY"), top_n=3)

# Configure the Query Engine with retriever and re-ranker
response_synthesizer = get_response_synthesizer(streaming=True)
query_engine = RetrieverQueryEngine.from_args(
    automerging_retriever,
    node_postprocessors=[reranker],
    response_synthesizer=response_synthesizer,
)
Step 2: Create the FastAPI Chat EndpointThis endpoint will handle the chat logic and stream responses.# Add to main.py
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI()

class ChatRequest(BaseModel):
    message: str

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    streaming_response = query_engine.query(request.message)

    async def event_generator():
        for token in streaming_response.response_gen:
            yield f"data: {token}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
To run the RAG service API:cd rag_service
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
Phase 4: Integrate with Existing Node.js BackendFinally, update your server/main.js to act as a proxy to the new Python service.Install axios if not already present in the backend dependencies.Modify the /api/v2/chat Endpoint: Replace the entire content of your existing /api/v2/chat route in server/main.js with the following logic.// In server/main.js
const axios = require('axios'); // Use require if in a CJS file

// ... other app setup ...

app.post('/api/v2/chat', async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Bad Request', message: 'Message must be a non-empty string.' });
  }

  try {
    const ragServiceUrl = 'http://localhost:8000/chat'; // URL of your Python FastAPI service
    
    // Forward the request to the Python RAG service
    const response = await axios.post(ragServiceUrl, {
      message: message,
      // You can add conversation_history here if you implement it
    }, {
      responseType: 'stream' // IMPORTANT: This tells axios to handle the response as a stream
    });

    // Set the headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Pipe the response stream from the Python service directly to the client
    response.data.pipe(res);

  } catch (error) {
    console.error('Error proxying chat request to RAG service:', error.message);
    res.status(503).json({ 
        error: 'Service Unavailable', 
        message: 'The AI service is currently unavailable. Please try again later.' 
    });
  }
});

---

## EXECUTION INSTRUCTIONS

Your task is to generate the code for the files outlined in the specification above. Follow these instructions precisely:

1.  **Work Sequentially:** Generate the files in the order they appear in the plan. Do not combine files.
2.  **File Structure:** Create a new directory named `rag_service` in the project root to house all new Python files.
3.  **File Generation:** For each file, clearly state the full path (e.g., `rag_service/requirements.txt`) and then provide the complete, final code for that file within a single code block.
4.  **Completeness:** Ensure all generated code is complete, correct, and includes all necessary imports and boilerplate.
5.  **Code Comments:** Add comments to your code, especially in the Python service, to explain the logic of each part of the RAG pipeline (e.g., "Initialize Qdrant client," "Configure hybrid retriever," "Define FastAPI endpoint").
6.  **Error Handling:** Include robust `try...except` blocks in the Python code for I/O operations and API calls to ensure stability.
7.  **Final Review:** After generating all files, perform a final review to ensure they are consistent with the architecture diagram and the step-by-step plan.

