# Fix common migration errors in all controller files
Write-Host "Fixing migration errors..." -ForegroundColor Cyan

$files = Get-ChildItem -Path "src/controllers" -Filter "*.controller.ts" -Exclude "*.supabase.ts"

foreach ($file in $files) {
  Write-Host "Processing $($file.Name)..." -ForegroundColor Yellow
  
  $content = Get-Content $file.FullName -Raw
  $originalContent = $content
  
  # 1. Remove duplicate const db declarations (keep only first one per function scope)
  $content = $content -replace '(export (?:const|function|async function) \w+[^{]*\{[^}]*?const db = supabaseAdmin\(\);[^\n]*\n)(\s+const db = supabaseAdmin\(\);[^\n]*\n)+', '$1'
  
  # 2. Remove MongoDB patterns that should be deleted
  $content = $content -replace '\.populate\([^)]+\)', './* NEED_JOIN */'
  $content = $content -replace '\.sort\(\{[^}]+\}\)', './* NEED_ORDER */'
  $content = $content -replace '\.skip\([^)]+\)', ''
  $content = $content -replace '\.limit\([^)]+\)', ''
  $content = $content -replace '\.distinct\([^)]+\)', './* NEED_DISTINCT */'
  $content = $content -replace '\.save\(\)', './* NEED_UPDATE */'
  $content = $content -replace '\.deleteOne\(\)', './* NEED_DELETE */'
  
  # 3. Remove /* MIGRATE: table */ comments
  $content = $content -replace '/\*\s*MIGRATE:\s*\w+\s*\*/', ''
  $content = $content -replace '/\*\s*MIGRATE:\s*\w+\s*COUNT\s*\*/', ''
  
  # 4. Fix req.user?.id to req.user?.userId  
  $content = $content -replace '\(req\.user\?\.userId \|\| req\.user\?\.id\)', 'req.user?.userId'
  
  # 5. Fix .match() calls (add filter parameter)
  $content = $content -replace '\.match\(\)', './* NEED_FILTERS */'
  
  # 6. Remove extra TODO comments added by migration
  $content = $content -replace 'const db = supabaseAdmin\(\); // TODO: Implement Supabase queries for \w+\s*\n', ''
  
  # 7. Fix .eq('id',) with missing second parameter
  $content = $content -replace '\.eq\(''id'',\s*\)', ".eq('id', 'FIXME')"
  
  # Only save if content changed
  if ($content -ne $originalContent) {
    Set-Content $file.FullName $content -NoNewline
    Write-Host "  ✓ Fixed $($file.Name)" -ForegroundColor Green
  } else {
    Write-Host "  - No changes needed" -ForegroundColor Gray
  }
}

Write-Host "`nDone! Check files for NEED_JOIN, NEED_ORDER, etc. markers" -ForegroundColor Cyan
