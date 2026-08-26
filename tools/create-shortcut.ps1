# 바탕화면에 "프로젝트 대시보드" 바로가기를 만든다.
# 실행: create-shortcut.bat 더블클릭 (또는 이 파일을 PowerShell 로 실행)

$ErrorActionPreference = "Stop"

# tools\ 의 부모가 프로젝트 폴더
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root "run.bat"
$icon = Join-Path $root "dashboard.ico"

if (-not (Test-Path $target)) {
  Write-Host "[오류] run.bat 을 찾을 수 없습니다: $target"
  exit 1
}

$desktop = [Environment]::GetFolderPath("Desktop")
$linkPath = Join-Path $desktop "프로젝트 대시보드.lnk"

$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($linkPath)
$link.TargetPath = $target
$link.WorkingDirectory = $root
$link.Description = "프로젝트 대시보드 (로컬 저장)"
# 7 = 최소화. 콘솔 창이 화면을 가리지 않게 한다 (서버는 그 창에서 계속 돌아간다)
$link.WindowStyle = 7
if (Test-Path $icon) { $link.IconLocation = "$icon,0" }
$link.Save()

Write-Host "바로가기를 만들었습니다:"
Write-Host "  $linkPath"
Write-Host "  → $target"
Write-Host ""
Write-Host "바탕화면에서 더블클릭하면 대시보드가 열립니다."
