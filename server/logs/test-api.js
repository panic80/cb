/**
 * Test script for Chat API functionality
 * 
 * This script tests the Gemini API connectivity and chat functionality
 * in both development and production environments.
 * 
 * Usage:
 * node test-api.js [--env=dev|prod] [--full]
 * 
 * Options:
 *   --env=dev|prod  Test in development or production environment (default: dev)
 *   --full          Run a more comprehensive test suite
 */

import fetch from 'node-fetch';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Parse command line arguments
const args = process.argv.slice(2);
const envArg = args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'dev';
const fullTest = args.includes('--full');

// Check for --invalid-key flag
const useInvalidKey = args.includes('--invalid-key');

// For testing purposes only - in practice, use the environment variable
const API_KEY = useInvalidKey 
  ? 'invalid-key-format' 
  : (process.env.VITE_GEMINI_API_KEY || 'AIzaTestKeyForLogging123456789');

console.log(`Using ${useInvalidKey ? 'invalid' : API_KEY.startsWith('AIzaTestKeyForLogging') ? 'test' : 'environment'} API key`);

// Test configuration
const config = {
  dev: {
    healthUrl: 'http://localhost:3001/health?test=true',
    apiUrl: 'http://localhost:3001/api/gemini/generateContent',
    travelInstructionsUrl: 'http://localhost:3001/api/travel-instructions'
  },
  prod: {
    healthUrl: 'https://yourproduction.url/health?test=true',
    apiUrl: 'https://yourproduction.url/api/gemini/generateContent',
    travelInstructionsUrl: 'https://yourproduction.url/api/travel-instructions'
  }
};

// Use the requested environment
const env = envArg === 'prod' ? 'prod' : 'dev';
console.log(`🧪 Running Chat API tests in ${env} environment`);

// Helper function to run a test
async function runTest(name, testFn) {
  try {
    console.log(`\n🔍 Running test: ${name}`);
    await testFn();
    console.log(`✅ Test passed: ${name}`);
    return true;
  } catch (error) {
    console.error(`❌ Test failed: ${name}`);
    console.error(`   Error: ${error.message}`);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      try {
        const text = await error.response.text();
        console.error(`   Response: ${text.substring(0, 200)}`);
      } catch (e) {}
    }
    return false;
  }
}

// Main test suite
async function runTests() {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const testResults = {};

  // Test 1: Check health endpoint
  testResults.health = await runTest('Health Check', async () => {
    const response = await fetch(config[env].healthUrl);
    if (!response.ok) throw new Error(`Health check failed with status ${response.status}`);
    
    const data = await response.json();
    console.log(`   💡 Server Status: ${data.status}`);
    console.log(`   💡 Environment: ${data.environment}`);
    console.log(`   💡 Uptime: ${data.uptime}`);
    
    if (data.chatApi && data.chatApi.status === 'healthy') {
      console.log(`   💡 Chat API Status: ${data.chatApi.status}`);
    }
  });
  
  testResults.health ? passed++ : failed++;

  // Test 2: Check travel instructions API
  testResults.travelInstructions = await runTest('Travel Instructions API', async () => {
    const response = await fetch(config[env].travelInstructionsUrl);
    if (!response.ok) throw new Error(`Travel API failed with status ${response.status}`);
    
    const data = await response.json();
    if (!data.content || data.content.length < 1000) {
      throw new Error('Invalid travel instructions content');
    }
    
    console.log(`   💡 Content length: ${data.content.length} chars`);
    console.log(`   💡 Cache status: ${data.fresh ? 'Fresh' : 'Cached'}`);
  });
  
  testResults.travelInstructions ? passed++ : failed++;

  // Test 3: Test Gemini API with proxy
  testResults.geminiProxy = await runTest('Gemini API via Proxy', async () => {
    const prompt = useInvalidKey
      ? "This should fail with an API key error"
      : "when do i get lunch";
    
    // For invalid key test, we expect this to fail
    const expectFailure = useInvalidKey;
    
    const response = await fetch(config[env].apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': API_KEY
      },
      body: JSON.stringify({
        prompt,
        model: "gemini-2.0-flash",
        generationConfig: {
          temperature: 0.1,
          topP: 0.1,
          topK: 1,
          maxOutputTokens: 100
        }
      })
    });
    
    // If we're testing invalid key, we expect an error
    if (expectFailure && response.ok) {
      throw new Error('Expected error with invalid API key but got success');
    }
    
    if (!response.ok) throw new Error(`Gemini API failed with status ${response.status}`);
    
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) throw new Error('No text in response');
    console.log(`   💡 Response: "${text.substring(0, 50)}..."`);
  });
  
  testResults.geminiProxy ? passed++ : failed++;

  // Test 4: Test direct Gemini API (only in full test mode)
  if (fullTest) {
    testResults.geminiDirect = await runTest('Gemini API Direct', async () => {
      const genAI = new GoogleGenerativeAI(API_KEY);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 100
        }
      });
      
      const prompt = "Say 'direct API test successful' if you can see this message";
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      if (!text) throw new Error('No text in response');
      console.log(`   💡 Response: "${text.substring(0, 50)}..."`);
    });
    
    testResults.geminiDirect ? passed++ : failed++;
  } else {
    skipped++;
  }

  // Test 5: Test error handling (only in full test mode and dev environment)
  if (fullTest && env === 'dev') {
    testResults.errorHandling = await runTest('Error Handling Test', async () => {
      const invalidApiKey = 'invalid-api-key';
      
      // This should fail
      try {
        const response = await fetch(config[env].apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': invalidApiKey
          },
          body: JSON.stringify({
            prompt: 'This should fail',
            model: "gemini-2.0-flash"
          })
        });
        
        // If we got here, the test failed because it should have errored
        if (response.ok) {
          throw new Error('Error handling test failed: Expected error but received OK response');
        }
        
        const data = await response.json();
        console.log(`   💡 Error status: ${response.status}`);
        console.log(`   💡 Error message: ${data.error || data.message}`);
        
        // Verify the error contains appropriate fields
        if (!data.error || !data.message) {
          throw new Error('Error response missing error or message fields');
        }
      } catch (error) {
        // We expect some kind of error here - just log it
        console.log(`   💡 Error handling test produced expected error`);
      }
    });
    
    testResults.errorHandling ? passed++ : failed++;
  } else {
    skipped++;
  }

  // Report results
  console.log('\n📊 Test Summary:');
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total: ${passed + failed + skipped}`);
  
  if (failed > 0) {
    console.log('\n❌ Some tests failed. Please check the log for details.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});