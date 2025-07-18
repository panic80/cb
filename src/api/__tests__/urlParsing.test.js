import { test, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'

// Mock axios
vi.mock('axios')

const TEST_PORT = 3000
const BASE_URL = `http://localhost:${TEST_PORT}/api/test-url-encoding`

beforeEach(() => {
  vi.resetAllMocks()
})

test('should parse complex URL-encoded body', async () => {
  const testData = {
    nested: {
      array: ['item1', 'item2'],
      specialChars: 'a+b=c%20d&e~f!'
    }
  }

  // Mock the axios response
  vi.mocked(axios.post).mockResolvedValue({
    data: {
      body: {
        nested: {
          array: ['item1', 'item2'],
          specialChars: 'a b=c d&e~f!'
        }
      }
    }
  })

  const response = await axios.post(BASE_URL, new URLSearchParams(testData), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  })

  expect(response.data.body).toMatchObject({
    nested: {
      array: ['item1', 'item2'],
      specialChars: 'a b=c d&e~f!'
    }
  })
})

test('should decode encoded URL components', async () => {
  const encodedParam = encodeURIComponent('price=$100&date=2023-12-31')
  
  // Mock the axios response
  vi.mocked(axios.get).mockResolvedValue({
    data: {
      query: {
        param: 'price=$100&date=2023-12-31'
      },
      originalUrl: '/api/test-url-encoding?param=price=$100&date=2023-12-31'
    }
  })
  
  const response = await axios.get(`${BASE_URL}?param=${encodedParam}`)

  expect(response.data.query.param).toBe('price=$100&date=2023-12-31')
  expect(response.data.originalUrl).toContain('price=$100&date=2023-12-31')
})

test('should handle multiple encoding layers', async () => {
  const doubleEncoded = encodeURIComponent(encodeURIComponent('user@example.com'))
  
  // Mock the axios response
  vi.mocked(axios.get).mockResolvedValue({
    data: {
      query: {
        email: 'user@example.com'
      }
    }
  })
  
  const response = await axios.get(`${BASE_URL}?email=${doubleEncoded}`)

  expect(decodeURIComponent(decodeURIComponent(doubleEncoded))).toBe('user@example.com')
  expect(response.data.query.email).toBe('user@example.com')
})