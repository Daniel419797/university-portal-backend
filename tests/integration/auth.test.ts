import request from 'supertest';
import app from '../../src/app';
import { startTestDatabase, stopTestDatabase } from '../utils/testDb';
import { supabaseAdmin } from '../../src/config/supabase';

const testUser = {
  email: 'testuser@example.com',
  password: 'Password123!',
  firstName: 'Test',
  lastName: 'User',
};

describe('Auth integration', () => {
  beforeAll(async () => {
    await startTestDatabase();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    // Clear test data if needed
  });

  it('returns healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('registers, logs in, and fetches current user', async () => {
    // Register
    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .send(testUser);

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.success).toBe(true);

    // Manually verify email to allow login (using Supabase admin)
    const { data: user } = await supabaseAdmin().auth.admin.listUsers();
    const testUserAuth = user.users.find((u: any) => u.email === testUser.email);
    if (testUserAuth) {
      await supabaseAdmin().auth.admin.updateUserById(testUserAuth.id, {
        email_confirm: true
      });
    }

    // Login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.accessToken).toBeDefined();
    const accessToken = loginRes.body.data.accessToken;

    // Fetch current user
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe(testUser.email);
    expect(meRes.body.data.firstName).toBe(testUser.firstName);
  });
});
