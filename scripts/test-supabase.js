/*
Quick Supabase connectivity tester
Usage:
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/test-supabase.js
Optionally set TEST_LECTURER_ID to query specific lecturer rows.
*/

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const url = process.env.SUPABASE_URL || '<MISSING_SUPABASE_URL>';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '<MISSING_SERVICE_ROLE_KEY>';
const testLecturer = process.env.TEST_LECTURER_ID || '28dee4ec-68d0-48b6-a0ed-9930a1c8d5d0';

console.log('SUPABASE_URL present:', process.env.SUPABASE_URL ? true : false);
console.log('SUPABASE_SERVICE_ROLE_KEY present:', process.env.SUPABASE_SERVICE_ROLE_KEY ? true : false);
console.log('TEST_LECTURER_ID:', testLecturer);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Please provide SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function serializeError(err) {
  if (!err) return null;
  try {
    return JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
  } catch (e) {
    return String(err);
  }
}

async function run() {
  try {
    console.log('\n== basic auth/settings check ==');
    const health = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }
    }).catch((e) => ({ ok: false, status: 'ERR', text: () => Promise.resolve(String(e)) }));
    if (health && health.ok) {
      console.log('auth settings reachable (200)');
    } else {
      const txt = await (health.text ? health.text() : Promise.resolve('no-text'));
      console.warn('auth settings not 200:', health.status, txt);
    }

    console.log('\n== query: courses (count head) ==');
    const coursesCount = await supabase.from('courses').select('id', { count: 'exact', head: true });
    console.log('status:', coursesCount.status);
    console.log('error:', serializeError(coursesCount.error));
    console.log('count:', coursesCount.count);

    console.log('\n== query: courses by lecturer ==');
    const coursesByLect = await supabase.from('courses').select('id,title,lecturer_id').eq('lecturer_id', testLecturer);
    console.log('status:', coursesByLect.status);
    console.log('error:', serializeError(coursesByLect.error));
    console.log('data length:', Array.isArray(coursesByLect.data) ? coursesByLect.data.length : String(coursesByLect.data));
    console.log('data sample:', coursesByLect.data && coursesByLect.data.slice(0,3));

    console.log('\n== query: enrollments for those courses ==');
    const courseIds = (coursesByLect.data || []).map(c => c.id).filter(Boolean);
    const enrollQuery = courseIds.length ? supabase.from('enrollments').select('id', { count: 'exact', head: true }).in('course_id', courseIds).eq('status', 'active') : null;
    if (enrollQuery) {
      const enrollRes = await enrollQuery;
      console.log('status:', enrollRes.status);
      console.log('error:', serializeError(enrollRes.error));
      console.log('count:', enrollRes.count);
    } else {
      console.log('no courseIds to query enrollments');
    }

  } catch (err) {
    console.error('Exception while testing Supabase:', err, Object.getOwnPropertyNames(err));
  }
}

run();
