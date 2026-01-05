/*
Script to backfill student IDs by calling the DB RPC per missing profile.
Usage:
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill_student_ids.js
*/

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

(async function run() {
  try {
    const { data: rows, error } = await supabase.from('profiles').select('id').eq('role', 'student').is('student_id', null);
    if (error) throw error;
    console.log('Profiles to backfill:', rows.length);
    for (const r of rows) {
      const { data: gen, error: genErr } = await supabase.rpc('generate_student_id');
      if (genErr) throw genErr;
      const sid = gen;
      const { error: updErr } = await supabase.from('profiles').update({ student_id: sid }).eq('id', r.id);
      if (updErr) throw updErr;
      console.log('Backfilled', r.id, '->', sid);
    }
    console.log('Backfill complete');
  } catch (err) {
    console.error('Backfill failed', err);
    process.exit(1);
  }
})();