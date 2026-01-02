#!/usr/bin/env pwsh
# Automated MongoDB to Supabase Controller Migration Script
# This script applies systematic transformations to migrate controllers

param(
    [switch]$DryRun = $false,
    [switch]$Verbose = $false
)

$ErrorActionPreference = "Stop"

# Configuration
$projectRoot = "c:\Users\HP\Desktop\university-portal-backend"
$controllersPath = Join-Path $projectRoot "src\controllers"
$backupPath = Join-Path $projectRoot "backup-mongodb-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

# Controllers already migrated
$completedControllers = @(
    'auth.controller.ts',
    'user.controller.ts',
    'course.controller.ts',
    'assignment.controller.ts',
    'notification.controller.ts'
)

# Controllers to migrate
$controllersToMigrate = @(
    'quiz.controller.ts',
    'result.controller.ts',
    'attendance.controller.ts',
    'payment.controller.ts',
    'message.controller.ts',
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

# Model to Table mapping
$modelToTable = @{
    'User' = 'profiles'
    'Course' = 'courses'
    'Assignment' = 'assignments'
    'Submission' = 'submissions'
    'Quiz' = 'quizzes'
    'QuizAttempt' = 'quiz_attempts'
    'Result' = 'results'
    'Enrollment' = 'enrollments'
    'Attendance' = 'attendance'
    'Payment' = 'payments'
    'InstallmentPlan' = 'installment_plans'
    'Hostel' = 'hostels'
    'HostelApplication' = 'hostel_applications'
    'Message' = 'messages'
    'Notification' = 'notifications'
    'Department' = 'departments'
    'Session' = 'sessions'
    'Scholarship' = 'scholarships'
    'ScholarshipApplication' = 'scholarship_applications'
    'Clearance' = 'clearance'
    'GradeAppeal' = 'grade_appeals'
    'AuditLog' = 'audit_logs'
    'CourseMaterial' = 'course_materials'
    'FileAsset' = 'file_assets'
    'Invoice' = 'invoices'
    'Announcement' = 'announcements'
}

function Write-MigrationLog {
    param([string]$Message, [string]$Level = "Info")
    
    $color = switch ($Level) {
        "Success" { "Green" }
        "Warning" { "Yellow" }
        "Error" { "Red" }
        default { "White" }
    }
    
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$timestamp] $Message" -ForegroundColor $color
}

function Convert-ToSnakeCase {
    param([string]$Text)
    
    # Handle common patterns
    $result = $Text -creplace '([A-Z]+)([A-Z][a-z])', '$1_$2'
    $result = $result -creplace '([a-z\d])([A-Z])', '$1_$2'
    $result = $result.ToLower()
    
    return $result
}

function Get-TableNameFromModel {
    param([string]$ModelName)
    
    if ($modelToTable.ContainsKey($ModelName)) {
        return $modelToTable[$ModelName]
    }
    
    # Fallback: pluralize and convert to snake_case
    $snake = Convert-ToSnakeCase $ModelName
    if ($snake -notmatch 's$') {
        $snake += 's'
    }
    return $snake
}

function Migrate-ControllerContent {
    param([string]$Content, [string]$FileName)
    
    Write-MigrationLog "  Processing imports..." "Info"
    
    # Extract model imports to determine table names
    $modelImports = [regex]::Matches($Content, "import\s+(\w+)\s+from\s+['\`"]\.\.\/models\/(\w+)\.model['\`"];")
    $usedTables = @{}
    
    foreach ($match in $modelImports) {
        $modelName = $match.Groups[1].Value
        $tableName = Get-TableNameFromModel $modelName
        $usedTables[$modelName] = $tableName
        if ($Verbose) {
            Write-MigrationLog "    $modelName -> $tableName" "Info"
        }
    }
    
    # Remove all model imports
    $Content = $Content -replace "import\s+\w+\s+from\s+['\`"]\.\.\/models\/\w+\.model['\`"];\r?\n", ""
    
    # Add Supabase import if not present
    if ($Content -notmatch "import.*supabaseAdmin") {
        $importIndex = $Content.IndexOf("import { Request, Response }")
        if ($importIndex -ge 0) {
            $endOfLine = $Content.IndexOf("`n", $importIndex) + 1
            $Content = $Content.Insert($endOfLine, "import { supabaseAdmin } from '../config/supabase';`n")
        }
    }
    
    Write-MigrationLog "  Applying transformation patterns..." "Info"
    
    # Replace common patterns
    $replacements = @(
        # User ID extraction
        @{
            Pattern = '\(req as any\)\.user\._id'
            Replacement = '(req.user?.userId || req.user?._id?.toString())'
        }
        @{
            Pattern = '\(req as any\)\.user\.userId'
            Replacement = '(req.user?.userId || req.user?._id?.toString())'
        }
        @{
            Pattern = '\(req as any\)\.user\.id'
            Replacement = '(req.user?.userId || req.user?._id?.toString())'
        }
        @{
            Pattern = '\(req as any\)\.user'
            Replacement = 'req.user'
        }
        
        # Field name conversions
        @{
            Pattern = '\.firstName'
            Replacement = '.first_name'
        }
        @{
            Pattern = '\.lastName'
            Replacement = '.last_name'
        }
        @{
            Pattern = '\.studentId'
            Replacement = '.student_id'
        }
        @{
            Pattern = '\.createdAt'
            Replacement = '.created_at'
        }
        @{
            Pattern = '\.updatedAt'
            Replacement = '.updated_at'
        }
        @{
            Pattern = '\.isActive'
            Replacement = '.is_active'
        }
        @{
            Pattern = '\.readAt'
            Replacement = '.read_at'
        }
        @{
            Pattern = '\.deletedAt'
            Replacement = '.deleted_at'
        }
        
        # Object field references
        @{
            Pattern = "firstName:"
            Replacement = "first_name:"
        }
        @{
            Pattern = "lastName:"
            Replacement = "last_name:"
        }
        @{
            Pattern = "studentId:"
            Replacement = "student_id:"
        }
        @{
            Pattern = "createdAt:"
            Replacement = "created_at:"
        }
        @{
            Pattern = "updatedAt:"
            Replacement = "updated_at:"
        }
        @{
            Pattern = "isActive:"
            Replacement = "is_active:"
        }
        
        # Remove .toString() calls
        @{
            Pattern = '\.toString\(\)'
            Replacement = ''
        }
        
        # Replace _id with id
        @{
            Pattern = '\._id'
            Replacement = '.id'
        }
    )
    
    foreach ($rep in $replacements) {
        $Content = $Content -replace $rep.Pattern, $rep.Replacement
    }
    
    Write-MigrationLog "  Converting MongoDB queries to Supabase..." "Info"
    
    # For each model, replace queries
    foreach ($model in $usedTables.Keys) {
        $table = $usedTables[$model]
        
        # Add db initialization comment markers
        $Content = $Content -replace "(export const \w+ = asyncHandler\(async \(req: Request, res: Response\) => \{)", 
            "`$1`n  const db = supabaseAdmin(); // TODO: Implement Supabase queries for $table"
        
        # Mark MongoDB patterns that need manual conversion
        $Content = $Content -replace "$model\.findById\(", "/* MIGRATE: $table */ db.from('$table').select('*').eq('id', "
        $Content = $Content -replace "$model\.find\(", "/* MIGRATE: $table */ db.from('$table').select('*').match("
        $Content = $Content -replace "$model\.findOne\(", "/* MIGRATE: $table */ db.from('$table').select('*').match("
        $Content = $Content -replace "$model\.create\(", "/* MIGRATE: $table */ db.from('$table').insert("
        $Content = $Content -replace "$model\.findByIdAndUpdate\(", "/* MIGRATE: $table */ db.from('$table').update("
        $Content = $Content -replace "$model\.findOneAndUpdate\(", "/* MIGRATE: $table */ db.from('$table').update("
        $Content = $Content -replace "$model\.deleteOne\(", "/* MIGRATE: $table */ db.from('$table').delete().eq('id',"
        $Content = $Content -replace "$model\.countDocuments\(", "/* MIGRATE: $table COUNT */ db.from('$table').select('*', { count: 'exact', head: true }).match("
        $Content = $Content -replace "$model\.insertMany\(", "/* MIGRATE: $table BULK */ db.from('$table').insert("
    }
    
    # Add migration notice at top
    $notice = @"
// =============================================================================
// MIGRATION STATUS: AUTO-CONVERTED - REQUIRES MANUAL REVIEW
// =============================================================================
// This file has been automatically migrated from MongoDB to Supabase.
// Search for /* MIGRATE: */ comments to find areas needing manual completion.
// 
// Key changes needed:
// 1. Complete query conversions (findById, find, create, etc.)
// 2. Add error handling for Supabase queries
// 3. Convert .populate() to JOIN syntax
// 4. Update field names (camelCase -> snake_case)
// 5. Test all endpoints
// 
// Original backup: $backupPath\$FileName
// =============================================================================

"@
    
    return $notice + $Content
}

# Main execution
Write-MigrationLog "=== MongoDB to Supabase Batch Migration ===" "Success"
Write-MigrationLog "Project: $projectRoot" "Info"
Write-MigrationLog "Dry Run: $DryRun" "Warning"

# Create backup directory
if (-not $DryRun) {
    New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
    Write-MigrationLog "Backup directory created: $backupPath" "Success"
}

$migratedCount = 0
$errorCount = 0

foreach ($controller in $controllersToMigrate) {
    $filePath = Join-Path $controllersPath $controller
    
    if (-not (Test-Path $filePath)) {
        Write-MigrationLog "⚠️  $controller not found, skipping..." "Warning"
        continue
    }
    
    Write-MigrationLog "`n📄 Processing $controller..." "Info"
    
    try {
        # Read content
        $content = Get-Content -Path $filePath -Raw -Encoding UTF8
        
        # Backup original
        if (-not $DryRun) {
            $backupFile = Join-Path $backupPath $controller
            Set-Content -Path $backupFile -Value $content -Encoding UTF8
            Write-MigrationLog "  ✓ Backed up to $backupPath" "Success"
        }
        
        # Apply migrations
        $migratedContent = Migrate-ControllerContent -Content $content -FileName $controller
        
        if ($DryRun) {
            Write-MigrationLog "  [DRY RUN] Would modify $controller" "Warning"
        } else {
            Set-Content -Path $filePath -Value $migratedContent -Encoding UTF8
            Write-MigrationLog "  ✓ Migration applied successfully" "Success"
        }
        
        $migratedCount++
        
    } catch {
        Write-MigrationLog "  ✗ Error: $($_.Exception.Message)" "Error"
        $errorCount++
    }
}

# Summary
Write-MigrationLog "`n=== Migration Complete ===" "Success"
Write-MigrationLog "Controllers processed: $migratedCount" "Success"
Write-MigrationLog "Errors: $errorCount" $(if ($errorCount -gt 0) { "Error" } else { "Success" })

if (-not $DryRun) {
    Write-MigrationLog "`nOriginal files backed up to: $backupPath" "Info"
}

Write-MigrationLog "`n⚠️  IMPORTANT NEXT STEPS:" "Warning"
Write-MigrationLog "1. Review each migrated file for /* MIGRATE: */ comments" "Info"
Write-MigrationLog "2. Complete manual query conversions" "Info"
Write-MigrationLog "3. Add proper error handling" "Info"
Write-MigrationLog "4. Convert .populate() to Supabase JOIN syntax" "Info"
Write-MigrationLog "5. Test each endpoint" "Info"
Write-MigrationLog "6. Run 'npm run build' to check for TypeScript errors" "Info"
Write-MigrationLog "7. Run 'npm test' to validate functionality" "Info"

if ($DryRun) {
    Write-MigrationLog "`n💡 This was a dry run. Use without -DryRun to apply changes." "Warning"
}
