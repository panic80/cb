import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import Chat from '../new-chat-interface/Chat';

describe('Production Chat Functionality', () => {
  // Mock the fetch API to simulate the production API response
  beforeAll(() => {
    jest.spyOn(window, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: 'This is a test assistant reply' }),
      })
    );
  });

  afterAll(() => {
    window.fetch.mockRestore();
  });

  test('sends a message and receives an assistant reply', async () => {
    // Render the Chat component with an API endpoint to trigger the API call in production mode
    render(<Chat apiEndpoint="https://api.example.com/chat" />);
    
    // Find the chat input field using its placeholder
    const input = screen.getByPlaceholderText(/Type a message.../i);
    
    // Simulate user typing a message
    fireEvent.change(input, { target: { value: 'Hello' } });
    
    // Find the send button and simulate a click event
    const sendButton = screen.getByRole('button', { name: /Send message/i });
    fireEvent.click(sendButton);
    
    // Assert that the user's message is rendered
    expect(screen.getByText('Hello')).toBeInTheDocument();
    
    // Wait for the assistant's reply (which is provided from the mocked fetch) to appear
    await waitFor(() =>
      expect(screen.getByText(/This is a test assistant reply/)).toBeInTheDocument()
    );
  });
});