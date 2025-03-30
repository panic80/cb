# Plan: Remove All Chat Functionality

This document outlines the steps to remove all chat-related functionality from the project codebase, covering both backend and frontend modifications.

## Phase 1: Backend Modifications

1.  **Disable/Remove API Endpoint:** Comment out or delete `app.post('/api/chat', ...)` route handler block in `server/proxy.js`.
2.  **Remove Chat Logger:**
    *   Delete the `server/services/logger.js` file.
    *   Remove imports and usage of `chatLogger` from:
        *   `server/proxy.js`
        *   `server/main.js`
        *   `server/middleware/logging.js`
        *   `server/__tests__/chat.test.js`
    *   Optionally, delete the `server/logs/chat.log` file if it exists.
3.  **Remove Chat Tests:**
    *   Delete `server/__tests__/chat.integration.test.js`.
    *   Delete `server/__tests__/chat.test.js`.
4.  **Update Health Check & Feature Flags:**
    *   In `server/proxy.js`: Remove the `chatApi` section from the `/health` endpoint response.
    *   In `server/proxy.js`: Set `aiChat: false` or remove the flag entirely from the `/config` endpoint response.
5.  **Remove Chatbot Serving:**
    *   In `server/main.js`: Remove the `/chatbot` route handling (`app.use('/chatbot', ...)` and `app.get('/chatbot/*', ...)`).

## Phase 2: Frontend Modifications

1.  **Remove Chat Directories:**
    *   Delete the following directories entirely:
        *   `src/components/chat/`
        *   `src/components/modern/`
        *   `src/components/policy-chat/`
        *   `src/new-chat-interface/`
2.  **Remove Core Chat Components/Pages:**
    *   Delete `src/components/Chat.tsx`.
    *   Delete `src/components/ChatWindow.jsx`.
    *   Delete `src/pages/PolicyChatPage.tsx`.
3.  **Remove Chat Context:**
    *   Delete `src/context/ChatContext.tsx`.
    *   Delete `src/context/ChatReducer.ts`.
    *   Delete `src/context/ChatTypes.ts`.
4.  **Remove Chat Types & Utils:**
    *   Delete `src/types/chat.ts`.
    *   Delete `src/types/messageAdapters.ts`.
    *   Delete `src/utils/chatErrors.ts`.
    *   Delete `src/utils/chatUtils.js`.
    *   Delete `src/utils/chatUtils.ts`.
    *   Delete `src/hooks/useUrlParser.ts` (if only used for chat).
    *   Delete `src/utils/useRetry.ts` (if only used for chat API calls).
5.  **Remove Chat API Calls:**
    *   Delete `src/api/gemini.jsx`.
    *   Modify `src/api/travelInstructions.js` to remove any chat-specific logic or delete if unused otherwise.
    *   Remove relevant tests in `src/api/__tests__/`.
6.  **Update Application Entry Point (`src/App.jsx`):**
    *   Remove imports related to any deleted chat components, pages, context, etc. (e.g., `PolicyChatPage`, `ChatProvider`).
    *   Remove the `/chat` and `/policy-chat` routes from the `<Routes>` configuration.
    *   Remove any `useChatContext` usage or related logic.
    *   Remove prefetching related to chat pages/components.
7.  **Update Other Components:**
    *   In `src/pages/LandingPage.jsx`: Remove the `LandingCard` components linking to `/policy-chat`. Remove the `preloadChat` useEffect.
    *   In `src/components/AboutModal.jsx`: Remove the list item mentioning the "Unofficial Policy Chatbot".
8.  **Remove Chat Styles:**
    *   Delete relevant CSS files in `src/styles/` (e.g., `chat.css`, `modern-chat.css`, `unified-chat.css`, `improved-chat-bubbles.css`).
    *   Check `src/index.css` and `src/App.css` for any remaining chat-specific styles to remove.
9.  **Remove Frontend Tests:**
    *   Delete `src/__tests__/chatProduction.test.jsx`.
    *   Delete relevant tests from `src/components/modern/__tests__/` and other potential test locations related to deleted components.

## Phase 3: Cleanup

1.  **Root Files:** Delete `test-chat-interface.html`.
2.  **Dependencies:** Review `package.json` and remove any dependencies that were solely used for chat functionality (if any are identified). Run `npm install` afterwards.
3.  **Documentation:** Review files in `docs/` (e.g., `architecture.md`, `chat_interface_plan.md`) and remove or update sections related to the chat feature.

## Diagram

```mermaid
graph TD
    subgraph Frontend
        A[React Components: Chat*, ModernChat*, PolicyChat*, NewChatInterface*] --> F{Remove};
        B[Pages: PolicyChatPage] --> F;
        C[Context: ChatContext/Reducer/Types] --> F;
        D[Utils/Types: chat*, messageAdapters, chatErrors] --> F;
        E[API: gemini.jsx, /api/chat calls] --> F;
        G[App.jsx: Routing, Imports] --> H{Update};
        I[LandingPage.jsx: Links] --> H;
        J[Styles: chat*.css] --> F;
        K[Tests: chat*.test.jsx] --> F;
    end

    subgraph Backend
        L[API Endpoint: /api/chat in proxy.js] --> M{Remove/Disable};
        N[Service: ChatLogger] --> M;
        O[Tests: chat*.test.js] --> M;
        P[Health Check/Config: chatApi, aiChat flag] --> Q{Update};
        R[Main.js: /chatbot serving] --> M
    end

    F --> Z[Chat Removed from Frontend];
    H --> Z;
    M --> Y[Chat Removed from Backend];
    Q --> Y;

    Z --> X[Final Cleanup: Deps, Docs];
    Y --> X;

    X --> W[Project without Chat];