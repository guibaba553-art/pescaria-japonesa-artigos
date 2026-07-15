const fs = require('fs');

function parseEnvFile(path) {
  if (!fs.existsSync(path)) return [];
  const content = fs.readFileSync(path, 'utf-8');
  const entries = [];
  content.split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) return;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    entries.push([key, value]);
  });
  return entries;
}

const files = ['.env', '.env.local', '.env.development', '.env.development.local'];
const allEntries = files.flatMap(f => parseEnvFile(f));

console.log('All entries in order:');
allEntries.forEach(([k, v]) => console.log('  ' + k + ' = ' + v.substring(0, 60) + (v.length > 60 ? '...' : '')));

const merged = Object.fromEntries(allEntries);
console.log('\nMerged VITE_SUPABASE_URL:', merged.VITE_SUPABASE_URL);
console.log('Merged VITE_SUPABASE_PUBLISHABLE_KEY:', merged.VITE_SUPABASE_PUBLISHABLE_KEY ? merged.VITE_SUPABASE_PUBLISHABLE_KEY.substring(0, 30) + '...' : 'UNDEFINED');
