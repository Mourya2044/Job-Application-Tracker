# Track Platform AWS Serverless Deployment Script
param (
    [ValidateSet("all", "api", "web")]
    [string]$Target = "all",
    [string]$Stage = "production",
    [string]$Region = "ap-south-1",
    [switch]$FullStack
)

$ErrorActionPreference = "Stop"
$StartTime = Get-Date

Write-Host "`n🚀 [1/3] Verifying AWS Credentials in $Region..." -ForegroundColor Cyan
$identityRaw = aws sts get-caller-identity --region $Region 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ AWS session is expired or not logged in: $identityRaw" -ForegroundColor Red
    Write-Host "👉 Please re-login using 'aws login' or 'aws configure', then rerun." -ForegroundColor Yellow
    exit 1
}
$identity = $identityRaw | ConvertFrom-Json
Write-Host "✅ Authenticated as: $($identity.Arn)" -ForegroundColor Green

# Export credentials for Serverless CLI
$creds = (aws configure export-credentials | ConvertFrom-Json)
$env:AWS_ACCESS_KEY_ID = $creds.AccessKeyId
$env:AWS_SECRET_ACCESS_KEY = $creds.SecretAccessKey
$env:AWS_SESSION_TOKEN = $creds.SessionToken
$env:AWS_DEFAULT_REGION = $Region
$env:AWS_REGION = $Region

# Load environment variables from .env or apps/api/.env
$envPaths = @(".env", "apps/api/.env")
foreach ($path in $envPaths) {
    if (Test-Path $path) {
        Get-Content $path | ForEach-Object {
            $line = $_.Trim()
            if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
                $parts = $line.Split("=", 2)
                $name = $parts[0].Trim()
                $val = $parts[1].Trim().Trim('"').Trim("'")
                if (-not [System.Environment]::GetEnvironmentVariable($name, "Process")) {
                    [System.Environment]::SetEnvironmentVariable($name, $val, "Process")
                }
            }
        }
    }
}

# 2. Build & Deploy API
if ($Target -eq "all" -or $Target -eq "api") {
    Write-Host "`n⚡ [2/3] Building & Deploying API Lambda..." -ForegroundColor Cyan
    npm run build:shared
    npm run build:api

    if ($FullStack) {
        Write-Host "Running full CloudFormation deployment..." -ForegroundColor Yellow
        npx --yes serverless@3 deploy --stage $Stage --region $Region
        Write-Host "✅ Full Serverless Stack deployed." -ForegroundColor Green
    } else {
        # Instant direct code deployment: skips CloudFormation hanging
        if (-not (Test-Path ".serverless")) {
            New-Item -ItemType Directory -Path ".serverless" -Force | Out-Null
        }
        tar -acf ".serverless/api.zip" "apps/api/dist/lambda.mjs"
        aws lambda update-function-code --function-name "track-platform-$Stage-api" --zip-file "fileb://.serverless/api.zip" --region $Region | Out-Null
        aws lambda update-function-code --function-name "track-platform-$Stage-queueWorker" --zip-file "fileb://.serverless/api.zip" --region $Region | Out-Null
        Write-Host "✅ API and Worker Lambda functions updated instantly (~2s)." -ForegroundColor Green
    }
}

# 3. Build & Sync Web Frontend
if ($Target -eq "all" -or $Target -eq "web") {
    Write-Host "`n🌐 [3/3] Building & Syncing Web Frontend..." -ForegroundColor Cyan
    npm run build:web

    $BucketName = "track-platform-$Stage-web-$($identity.Account)"
    aws s3 sync "apps/web/dist" "s3://$BucketName" --region $Region --delete
    Write-Host "✅ Web frontend synced to S3 bucket: $BucketName" -ForegroundColor Green

    # Automatically invalidate CloudFront cache so changes reflect instantly
    $distId = aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='track-platform-$Stage CDN Distribution'].Id | [0]" --output text
    if ($distId -and $distId -ne "None") {
        aws cloudfront create-invalidation --distribution-id $distId --paths "/*" | Out-Null
        Write-Host "✅ CloudFront cache invalidated for distribution $distId" -ForegroundColor Green
    }
}

$Elapsed = [math]::Round(((Get-Date) - $StartTime).TotalSeconds, 1)
Write-Host "`n🎉 Deployment finished in ${Elapsed}s! Live at: https://track.mourya.tech`n" -ForegroundColor Green
