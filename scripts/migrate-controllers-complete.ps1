#!/usr/bin/env pwsh
# Complete MongoDB to Supabase Migration Script
# This script performs comprehensive pattern-based migration

param(
    [string[]]$Controllers = @(),
    [switch]$All = $false,
    [switch]$DryRun = $false
)

$projectRoot = "c:\Users\HP\Desktop\university-portal-backend"
$controllersPath = Join-Path $projectRoot "src\controllers"
$backupPath = Join-Path $projectRoot "backup-complete-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

$completedControllers = @(
    'auth.controller.ts',
    'user.controller.ts', 
    'course.controller.ts',
    'assignment.controller.ts',
    'notification.controller.ts'
)

function Convert-MongooseToSupabase {
    param([string]$Content, [string]$ModelName, [string]$TableName)
    
    # Pattern 1: Model.findById(id)
    $Content = $Content -replace "($ModelName\.findById\()([^)]+)\)", {
        param($m)
        $id = $m.Groups[2].Value
        @"
await db.from('$TableName').select('*').eq('id', $id).maybeSingle()
"@
    }
    
    # Pattern 2: Model.find(query)
    $Content = $Content -replace "($ModelName\.find\()([^)]+)\)", {
        param($m)
        "/* TODO: Convert query */ await db.from('$TableName').select('*')"
    }
    
    # Pattern 3: Model.create(data)
    $Content = $Content -replace "($ModelName\.create\()([^)]+)\)", {
        param($m)
        "await db.from('$TableName').insert(/* TODO: Map fields */).select().single()"
    }
    
    # Pattern 4: Model.findByIdAndUpdate
    $Content = $Content -replace "($ModelName\.findByIdAndUpdate\()([^,]+),\s*([^,]+)", {
        param($m)
        $id = $m.Groups[2].Value
        "await db.from('$TableName').update(/* TODO: Map fields */).eq('id', $id).select().single()"
    }
    
    # Pattern 5: Model.deleteOne() or item.deleteOne()
    $Content = $Content -replace "\.deleteOne\(\)", ".delete().eq('id', /* TODO: ID */)"
    
    # Pattern 6: Model.countDocuments(query)
    $Content = $Content -replace "($ModelName\.countDocuments\()([^)]*)\)", {
        "await db.from('$TableName').select('*', { count: 'exact', head: true })"
    }
    
    # Pattern 7: .populate('field', 'columns')
    $Content = $Content -replace "\.populate\(['\`"](\w+)['\`"],\s*['\`"]([^'\`"]+)['\`"]\)", {
        param($m)
        $field = $m.Groups[1].Value
        $columns = $m.Groups[2].Value -replace '\s+', ','
        "/* TODO: Add to .select(): $field($columns) */"
    }
    
    # Pattern 8: .sort({ field: -1 })
    $Content = $Content -replace "\.sort\(\{\s*(\w+):\s*(-?\d+)\s*\}\)", {
        param($m)
        $field = Convert-ToSnakeCase $m.Groups[1].Value
        $order = if ($m.Groups[2].Value -eq "-1") { "false" } else { "true" }
        ".order('$field', { ascending: $order })"
    }
    
    # Pattern 9: .skip(n).limit(m)
    $Content = $Content -replace "\.skip\(([^)]+)\)\.limit\(([^)]+)\)", {
        param($m)
        $skip = $m.Groups[1].Value
        $limit = $m.Groups[2].Value
        ".range($skip, $skip + $limit - 1)"
    }
    
    # Pattern 10: .lean()
    $Content = $Content -replace "\.lean\(\)", ""
    
    return $Content
}

function Get-ModelImports {
    param([string]$Content)
    
    $imports = @{}
    $pattern = "import\s+(\w+)\s+from\s+['\`"]\.\.\/models\/(\w+)\.model['\`"];"
    $matches = [regex]::Matches($Content, $pattern)
    
    foreach ($match in $matches) {
        $modelName = $match.Groups[1].Value
        $fileName = $match.Groups[2].Value
        
        # Determine table name
        $tableName = switch ($modelName) {
            'User' { 'profiles' }
            'Quiz' { 'quizzes' }
            'QuizAttempt' { 'quiz_attempts' }
            'HostelApplication' { 'hostel_applications' }
            'InstallmentPlan' { 'installment_plans' }
            'ScholarshipApplication' { 'scholarship_applications' }
            'GradeAppeal' { 'grade_appeals' }
            'CourseMaterial' { 'course_materials' }
            'FileAsset' { 'file_assets' }
            'AuditLog' { 'audit_logs' }
            default {
                $snake = ($modelName -creplace '([A-Z])', '_$1').ToLower().TrimStart('_')
                if ($snake -notmatch 's$') { $snake += 's' }
                $snake
            }
        }
        
        $imports[$modelName] = $tableName
    }
    
    return $imports
}

function Migrate-Controller {
    param([string]$FilePath)
    
    $fileName = Split-Path $FilePath -Leaf
    Write-Host "`n🔧 Migrating $fileName..." -ForegroundColor Cyan
    
    $content = Get-Content -Path $FilePath -Raw
    
    # Get model imports
    $models = Get-ModelImports $content
    
    if ($models.Count -eq 0) {
        Write-Host "  ⚠️  No MongoDB models found, skipping..." -ForegroundColor Yellow
        return
    }
    
    Write-Host "  📦 Found models: $($models.Keys -join ', ')" -ForegroundColor White
    
    # Remove model imports
    $content = $content -replace "import\s+\w+\s+from\s+['\`"]\.\.\/models\/\w+\.model['\`"];\r?\n", ""
    
    # Add Supabase import
    if ($content -notmatch "import.*supabaseAdmin") {
        $importLine = "import { supabaseAdmin } from '../config/supabase';`n"
        $content = $content -replace "(import { Request, Response }[^;]+;)", "`$1`n$importLine"
    }
    
    # Add db initialization to each function
    $content = $content -replace "(export const \w+ = asyncHandler\(async \(req: Request, res: Response\) => \{)", 
        "`$1`n  const db = supabaseAdmin();"
    
    # Convert user ID patterns
    $content = $content -replace '\(req as any\)\.user\._id', 'req.user?.userId || req.user?._id?.toString()'
    $content = $content -replace '\(req as any\)\.user\.id', 'req.user?.userId || req.user?._id?.toString()'
    $content = $content -replace '\(req as any\)\.user', 'req.user'
    
    # Apply model-specific conversions
    foreach ($model in $models.Keys) {
        $table = $models[$model]
        Write-Host "  🔄 Converting $model -> $table" -ForegroundColor Gray
        $content = Convert-MongooseToSupabase -Content $content -ModelName $model -TableName $table
    }
    
    # Field name conversions
    $fieldMappings = @{
        'firstName' = 'first_name'
        'lastName' = 'last_name'
        'studentId' = 'student_id'
        'lecturerId' = 'lecturer_id'
        'courseId' = 'course_id'
        'sessionId' = 'session_id'
        'departmentId' = 'department_id'
        'createdAt' = 'created_at'
        'updatedAt' = 'updated_at'
        'deletedAt' = 'deleted_at'
        'isActive' = 'is_active'
        'isRead' = 'read_at'
        'readAt' = 'read_at'
        'startDate' = 'start_date'
        'endDate' = 'end_date'
        'dueDate' = 'due_date'
        'totalMarks' = 'total_marks'
        'totalScore' = 'total_score'
    }
    
    foreach ($old in $fieldMappings.Keys) {
        $new = $fieldMappings[$old]
        $content = $content -replace "\.${old}(\W)", ".$new`$1"
        $content = $content -replace "${old}:", "${new}:"
    }
    
    # Remove .toString()
    $content = $content -replace '\.toString\(\)', ''
    
    # Replace _id with id
    $content = $content -replace '\._id(\W)', '.id$1'
    
    # Add migration header
    $header = @"
// ============================================================================
// MIGRATION: AUTO-CONVERTED TO SUPABASE
// ============================================================================
// Original backup: $backupPath\$fileName
// Review TODO comments and complete manual conversions
// ============================================================================

"@
    
    $content = $header + $content
    
    if (-not $DryRun) {
        # Backup
        $backupFile = Join-Path $backupPath $fileName
        Copy-Item -Path $FilePath -Destination $backupFile -Force
        
        # Write migrated content
        Set-Content -Path $FilePath -Value $content -Encoding UTF8
        Write-Host "  ✅ Migrated successfully" -ForegroundColor Green
    } else {
        Write-Host "  [DRY RUN] Would migrate $fileName" -ForegroundColor Yellow
    }
}

# Main
Write-Host "=== Complete Controller Migration ===" -ForegroundColor Cyan

if (-not $DryRun) {
    New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
}

$toMigrate = if ($All) {
    Get-ChildItem $controllersPath -Filter "*.controller.ts" | 
        Where-Object { $_.Name -notin $completedControllers } |
        Select-Object -ExpandProperty FullName
} elseif ($Controllers.Count -gt 0) {
    $Controllers | ForEach-Object {
        $name = if ($_ -notmatch '\.ts$') { "$_.controller.ts" } else { $_ }
        Join-Path $controllersPath $name
    }
} else {
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\migrate-controllers-complete.ps1 -All" -ForegroundColor White
    Write-Host "  .\migrate-controllers-complete.ps1 -Controllers quiz,result,attendance" -ForegroundColor White
    Write-Host "  .\migrate-controllers-complete.ps1 -All -DryRun" -ForegroundColor White
    exit
}

foreach ($file in $toMigrate) {
    if (Test-Path $file) {
        Migrate-Controller -FilePath $file
    }
}

Write-Host "`n✨ Migration complete!" -ForegroundColor Green
Write-Host "Backup: $backupPath" -ForegroundColor Cyan
Write-Host "`nNext: Review TODO comments and test endpoints" -ForegroundColor Yellow
