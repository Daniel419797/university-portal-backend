# Comprehensive MongoDB to Supabase Migration Script
# This script handles systematic migration of all controllers

$controllersPath = "c:\Users\HP\Desktop\university-portal-backend\src\controllers"
$backupPath = "c:\Users\HP\Desktop\university-portal-backend\backup-mongodb-controllers"

# Create backup directory
if (-not (Test-Path $backupPath)) {
    New-Item -ItemType Directory -Path $backupPath | Out-Null
}

# List of controllers to migrate (excluding already completed ones)
$controllersToMigrate = @(
    'notification.controller.ts',
    'message.controller.ts',
    'quiz.controller.ts',
    'result.controller.ts',
    'attendance.controller.ts',
    'payment.controller.ts',
    'hostel.controller.ts',
    'clearance.controller.ts',
    'bursary.controller.ts',
    'installment.controller.ts',
    'lecturer.controller.ts',
    'student.controller.ts',
    'hod.controller.ts',
    'admin.controller.ts',
    'dashboard.controller.ts',
    'scholarship.controller.ts',
    'appeal.controller.ts',
    'file.controller.ts',
    'material.controller.ts',
    'settings.controller.ts'
)

Write-Host "Starting MongoDB to Supabase migration..." -ForegroundColor Cyan
Write-Host "Backup location: $backupPath" -ForegroundColor Yellow

foreach ($controller in $controllersToMigrate) {
    $filePath = Join-Path $controllersPath $controller
    if (Test-Path $filePath) {
        Write-Host "Processing $controller..." -ForegroundColor Green
        
        # Create backup
        Copy-Item -Path $filePath -Destination (Join-Path $backupPath $controller) -Force
        
        # Read file content
        $content = Get-Content -Path $filePath -Raw
        
        # MongoDB to Supabase mappings
        $content = $content -replace "import .* from '\.\./models/.*\.model';", ""
        $content = $content -replace "import { supabaseAdmin } from '\.\./config/supabase';`n", ""
        $content = "import { supabaseAdmin } from '../config/supabase';`n" + $content
        
        # Common patterns - Model.find, Model.findById, Model.create, etc.
        $patterns = @{
            # Basic patterns
            '\.findById\(' = 'NEEDS_MIGRATION_findById('
            '\.find\(' = 'NEEDS_MIGRATION_find('
            '\.findOne\(' = 'NEEDS_MIGRATION_findOne('
            '\.create\(' = 'NEEDS_MIGRATION_create('
            '\.findByIdAndUpdate\(' = 'NEEDS_MIGRATION_findByIdAndUpdate('
            '\.findOneAndUpdate\(' = 'NEEDS_MIGRATION_findOneAndUpdate('
            '\.findByIdAndDelete\(' = 'NEEDS_MIGRATION_findByIdAndDelete('
            '\.deleteOne\(' = 'NEEDS_MIGRATION_deleteOne('
            '\.countDocuments\(' = 'NEEDS_MIGRATION_countDocuments('
            '\.insertMany\(' = 'NEEDS_MIGRATION_insertMany('
            '\.populate\(' = 'NEEDS_MIGRATION_populate('
            '\.lean\(' = 'NEEDS_MIGRATION_lean('
            '\(req as any\)\.user' = 'req.user'
            '\.toString\(\)' = ''
            '_id' = 'id'
        }
        
        foreach ($pattern in $patterns.Keys) {
            $content = $content -replace $pattern, $patterns[$pattern]
        }
        
        # Mark file as needing manual review
        $header = "// MIGRATION NOTE: This file has been pre-processed for Supabase migration`n// Please review and complete the migration manually`n// Original backup: $backupPath\$controller`n`n"
        $content = $header + $content
        
        # Save modified content
        Set-Content -Path $filePath -Value $content -NoNewline
        
        Write-Host "  ✓ Backed up and marked for migration" -ForegroundColor Yellow
    }
}

Write-Host "`nMigration preparation complete!" -ForegroundColor Cyan
Write-Host "Next steps:" -ForegroundColor Green
Write-Host "1. Review each controller marked with NEEDS_MIGRATION_*" -ForegroundColor White
Write-Host "2. Replace MongoDB patterns with Supabase queries" -ForegroundColor White
Write-Host "3. Test each controller after migration" -ForegroundColor White
Write-Host "4. Original files backed up to: $backupPath" -ForegroundColor White
