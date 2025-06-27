#!/usr/bin/env node

// Test script for Google Maps API integration
// Usage: node test-maps-integration.js

import fetch from 'node-fetch';

const testLocations = [
  { origin: 'CFB Toronto', destination: 'CFB Ottawa' },
  { origin: 'Toronto, ON', destination: 'Ottawa, ON' },
  { origin: 'Vancouver, BC', destination: 'Calgary, AB' }
];

const testEndpoint = async (origin, destination) => {
  console.log(`\nTesting: ${origin} → ${destination}`);
  console.log('='.repeat(50));
  
  try {
    const response = await fetch('http://localhost:3000/api/maps/distance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        origin,
        destination,
        mode: 'driving'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Error:', error);
      return;
    }

    const data = await response.json();
    console.log('✅ Success!');
    console.log(`   Distance: ${data.distance.text}`);
    console.log(`   Duration: ${data.duration.text}`);
    console.log(`   Resolved Origin: ${data.origin}`);
    console.log(`   Resolved Destination: ${data.destination}`);
  } catch (error) {
    console.error('❌ Network error:', error.message);
  }
};

const runTests = async () => {
  console.log('Google Maps Distance API Integration Test');
  console.log('Make sure the server is running on port 3000');
  console.log('Make sure GOOGLE_MAPS_API_KEY is set in .env');
  
  for (const test of testLocations) {
    await testEndpoint(test.origin, test.destination);
    // Wait between requests to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n✅ All tests completed!');
};

runTests().catch(console.error);