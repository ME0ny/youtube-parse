# merge-files.ps1
# Merges all text files into one, skips media and self
# Works with paths containing Cyrillic (e.g. D:\разработка\)
# Output: all_code.txt (UTF-8 without BOM)

$outFile = "all_code.txt"
$thisScript = $MyInvocation.MyCommand.Name

# Extensions to skip
$mediaExtensions = @(
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".ico",
    ".mp3", ".wav", ".flac", ".aac", ".ogg",
    ".mp4", ".avi", ".mov", ".mkv", ".wmv", ".webm",
    ".pdf", ".psd", ".ai", ".eps"
)

# Full output path
$outputPath = Join-Path (Get-Location) $outFile

# Remove existing file
if (Test-Path $outputPath) {
    Remove-Item $outputPath -Force
    Write-Host "Removed old file: $outFile"
}

# UTF-8 without BOM
$utf8 = New-Object System.Text.UTF8Encoding $false

# Create StreamWriter
try {
    $writer = New-Object System.IO.StreamWriter($outputPath, $false, $utf8)
    Write-Host "Created output file: $outFile"
}
catch {
    Write-Host "ERROR: Failed to create file: $_"
    exit 1
}

# Get all files
$files = Get-ChildItem -Recurse -File | Where-Object {
    ($mediaExtensions -notcontains $_.Extension.ToLower()) -and
    ($_.Name -ine $outFile) -and
    ($_.Name -ine $thisScript)
}

$total = $files.Count
$counter = 0

foreach ($file in $files) {
    $counter++
    Write-Progress -Activity "Merging files" `
                   -Status "Processed $counter of $total" `
                   -PercentComplete (($counter / $total) * 100)

    Write-Host "[$counter / $total] Adding: $($file.FullName)"

    try {
        $writer.WriteLine("`n=== START FILE: $($file.FullName) ===`n")
        $content = Get-Content -Path $file.FullName -Encoding UTF8 -Raw -ErrorAction Stop
        $writer.Write($content)
        $writer.WriteLine("`n`n=== END FILE: $($file.FullName) ===`n")
        $writer.WriteLine("--------------------------------------------------------------------------------")
    }
    catch {
        Write-Host "Warning: Could not read file: $($file.FullName)"
        $writer.WriteLine("WARNING: Could not read file: $($file.FullName)")
    }
}

# Close writer
try {
    $writer.Flush()
    $writer.Close()
    $writer.Dispose()
    Write-Progress -Activity "Merging files" -Completed
    Write-Host "SUCCESS: All files merged into '$outFile'"
    Write-Host "Path: $outputPath"
}
catch {
    Write-Host "ERROR: Failed to close file: $_"
}