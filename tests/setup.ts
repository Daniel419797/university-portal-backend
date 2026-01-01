import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';

// Global test setup
beforeAll(async () => {
  // Connect to test database if needed
});

afterAll(async () => {
  // Cleanup after all tests
});

// Increase timeout for integration tests
jest.setTimeout(30000);
