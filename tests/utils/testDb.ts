import { supabaseAdmin } from '../../src/config/supabase';

export const startTestDatabase = async () => {
  // Ensure Supabase is configured
  if (!process.env.SUPABASE_URL) {
    throw new Error('SUPABASE_URL environment variable is required for tests');
  }
  // Test connection
  const { error } = await supabaseAdmin().from('profiles').select('id').limit(1);
  if (error) {
    throw new Error(`Failed to connect to Supabase: ${error.message}`);
  }
};

export const stopTestDatabase = async () => {
  // Clean up test data if needed
  // For now, just log that tests are done
  console.log('Test database cleanup completed');
};
