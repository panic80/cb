# AI Chatbot Requirements & Scope

## 1. Introduction

This document outlines the requirements and scope for integrating a new AI-powered chatbot into the project hosted at `/Users/mattermost/Projects/32cbgg8.com/cb`.

**Important Context:** A previous chat feature existed within this project but was subsequently removed (see `docs/remove-chat-plan.md`). The development of this new chatbot should consider any lessons learned from the previous implementation, although the specific reasons for removal are not detailed in the available documentation.

## 2. Purpose & Goals

*   **Primary Goal:** To enhance user engagement and provide assistance by answering user queries related to the project or application content directly within the interface.
*   **Problem Solved:** Reduce the need for users to manually search for information (e.g., FAQs, project details) and provide instant support.
*   **Value Added:** Improve user experience, potentially increase task completion rates (if applicable to the application's function), and offer a modern interaction method.

## 3. Features

### 3.1 Minimum Viable Product (MVP)

*   **Basic Conversation:**
    *   Welcome/Greeting message upon initiating chat.
    *   Ability to understand and respond to simple user questions in natural language.
    *   Clear indication when the chatbot is typing or processing.
    *   Basic error handling (e.g., "Sorry, I didn't understand that.").
*   **Knowledge Base:**
    *   Ability to answer Frequently Asked Questions (FAQs), potentially leveraging content from `src/pages/FAQPage.jsx`.
    *   Ability to answer general questions about the project/application's purpose (drawing from existing content like `src/components/AboutModal.jsx`).
*   **User Interface:**
    *   A simple, non-intrusive chat widget or interface element.
    *   Input field for users to type questions.
    *   Display area for conversation history within the current session.
    *   Mechanism to open/close the chat interface.
*   **Backend Integration:**
    *   A dedicated API endpoint (e.g., `/api/v2/chat`) to handle communication between the frontend and the chosen AI service, likely routed through the existing `server/proxy.js`.

### 3.2 Nice-to-Have Features (Post-MVP)

*   **Conversation Management:**
    *   Maintaining conversation context across multiple turns.
    *   Ability to handle follow-up questions.
    *   Graceful handling of off-topic or irrelevant questions.
    *   Option for users to clear conversation history.
*   **Enhanced Knowledge:**
    *   Integration with other project data sources or APIs (e.g., potentially providing information related to OPI contacts from `src/data/opiContacts.js` if appropriate and secure).
    *   Ability to guide users through specific tasks within the application.
*   **User Feedback:**
    *   Mechanism for users to provide feedback on chatbot responses (e.g., thumbs up/down).
*   **Customization:**
    *   Configurable personality/tone.
    *   Potential administrative interface for managing FAQs or knowledge base.

## 4. Target Audience & Interaction Style

*   **Target Audience:** General users of the web application.
*   **Interaction Tone:** Friendly, helpful, and informative. Should align with the overall tone of the application. Avoid overly technical jargon unless the user's query specifically requires it.

## 5. AI Model Considerations

*   **Potential Services:**
    *   **Google Gemini API:** Known for strong conversational abilities and potential integration benefits if other Google Cloud services are used. Note: The previous implementation seemed to use a file named `gemini.jsx`, suggesting prior use. The connected `gemini-policy-server` MCP might also be relevant.
    *   **OpenAI API (GPT models):** Widely used, powerful models (GPT-3.5, GPT-4, etc.) with extensive documentation.
    *   **Other Cloud Provider Services:** AWS Lex, Azure Bot Service.
    *   **Self-Hosted Models:** More complex setup, but offers maximum data privacy control (e.g., using models like Llama, Mistral).
*   **Constraints/Preferences:**
    *   **Cost:** API usage costs need to be evaluated for each service.
    *   **Performance:** Response latency is crucial for a good user experience.
    *   **Data Privacy:** How user input is processed by the third-party AI service is a key consideration (see Security section).
    *   **Decision Criteria:** The choice should be based on a balance of capability, cost, ease of integration, performance, and alignment with privacy requirements.

## 6. Data Handling & Security

*   **Conversation History:**
    *   **MVP:** No long-term storage of conversation history. History is maintained only for the duration of the user's session in the browser.
    *   **Post-MVP:** If history storage is needed (e.g., for analysis or user convenience), define requirements for storage location (database?), duration, and user consent mechanisms.
*   **User Input:**
    *   Avoid prompting for or encouraging users to enter Personally Identifiable Information (PII) or sensitive data.
    *   Implement input sanitization/validation if possible before sending data to the AI model.
*   **API Keys & Secrets:**
    *   AI service API keys must be stored securely on the backend (e.g., environment variables accessed by `server/proxy.js` or `server/main.js`) and never exposed to the frontend.
*   **Data Transmission:**
    *   All communication between the frontend, backend proxy, and AI service must use HTTPS.
*   **AI Service Privacy:**
    *   Review the chosen AI service's data usage and privacy policies carefully. Determine if user data is used for model training and if opt-out options are available/required.

## 7. Scope Limitation

This document defines the *what* (requirements) and *why* (purpose) of the chatbot. It does **not** define the *how* (architecture, specific implementation details). Architectural design and implementation planning will be separate tasks.