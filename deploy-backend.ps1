# Deploy backend/ directory directly to Hugging Face Spaces
Write-Host "🚀 Deploying backend to Hugging Face Spaces..." -ForegroundColor Cyan

# 1. Create a clean split branch of the backend folder
$tempBranch = "hf-deploy-" + [System.Guid]::NewGuid().ToString("N").Substring(0, 8)
git subtree split --prefix backend -b $tempBranch
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to create subtree split for backend."
    exit $LASTEXITCODE
}

try {
    # 2. Push to Hugging Face Space main branch
    Write-Host "📤 Pushing backend to huggingface main branch..." -ForegroundColor Cyan
    git push huggingface "${tempBranch}:main" --force
    $pushResult = $LASTEXITCODE
} finally {
    # 3. Clean up the temporary split branch
    git branch -D $tempBranch | Out-Null
}

if ($pushResult -eq 0) {
    Write-Host "✅ Successfully deployed backend to https://mouryasaha-job-tracker-backend.hf.space" -ForegroundColor Green
} else {
    Write-Error "❌ Failed to push to Hugging Face Spaces."
    exit $pushResult
}
