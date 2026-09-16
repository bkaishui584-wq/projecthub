# 一键启动 ProjectHub（含本机开源模型）并生成临时公网网址
# 用法：右键此文件 -> 使用 PowerShell 运行

$ErrorActionPreference = "Continue"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8787
$ollamaPort = 11434

Write-Host "正在启动 ProjectHub ..." -ForegroundColor Cyan

# 1. 如果装了 Ollama，就顺便把本地模型服务拉起来
$ollamaExe = $null
$cmd = Get-Command ollama -ErrorAction SilentlyContinue
if ($cmd) { $ollamaExe = $cmd.Source }
elseif (Test-Path "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe") { $ollamaExe = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" }

if ($ollamaExe) {
  $listening = $false
  try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect("127.0.0.1", $ollamaPort); if ($c.Connected) { $listening = $true }; $c.Close() } catch {}
  if (-not $listening) {
    Write-Host "正在启动本地模型服务（Ollama）..." -ForegroundColor Cyan
    Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 3
  }
  $env:OLLAMA_BASE_URL = "http://127.0.0.1:$ollamaPort"
  Write-Host "本地模型已启用，网页上会显示当前模型名称。" -ForegroundColor Green
} else {
  Write-Host "未检测到 Ollama：本次将使用内置的本地演示模式。" -ForegroundColor Yellow
  Write-Host "想接入开源模型：安装 https://ollama.com/download 后执行 ollama pull qwen2.5:7b" -ForegroundColor DarkGray
}

# 2. 环境变量（ADMIN_PASSWORD 等敏感配置保存在项目根的 .env 中，服务启动时会自动读取）
if (-not $env:NODE_ENV) { $env:NODE_ENV = "production" }
if (-not $env:TRUST_PROXY) { $env:TRUST_PROXY = "1" }
# 3. 启动 ProjectHub 服务器
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if ($nodeCmd) { $nodeCmd.Source } else { "C:\Users\YUNIAN\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" }
Start-Process -FilePath $nodeExe -ArgumentList "server.js" -WorkingDirectory $dir -WindowStyle Hidden
Start-Sleep -Seconds 2

# 4. 启动 Cloudflare 临时隧道
$cloudflared = Join-Path $env:USERPROFILE ".cache\projecthub-tools\cloudflared.exe"
if (-not (Test-Path $cloudflared)) {
  Write-Host "未找到 cloudflared，只能本机访问： http://localhost:$port" -ForegroundColor Yellow
  exit 1
}

Write-Host "正在生成公网网址（几秒后会出现 trycloudflare.com 链接）..." -ForegroundColor Cyan
Write-Host "关闭本窗口即可停止公网访问。" -ForegroundColor DarkGray
& $cloudflared tunnel --url "http://localhost:$port" --no-autoupdate
