# Сборка APK: powershell -File build.ps1 -> mafia18.apk
$env:TEMP="D:\AndroidDev\tmp"; $env:TMP="D:\AndroidDev\tmp"
$env:JAVA_HOME="D:\AndroidDev\jdk"; $env:GRADLE_USER_HOME="D:\AndroidDev\gradle-home"
Set-Location $PSScriptRoot
& D:\AndroidDev\gradle\bin\gradle.bat assembleRelease --no-daemon -q 2>&1 | Select-String -NotMatch "^Note:"
Copy-Item app\build\outputs\apk\release\app-release.apk mafia18.apk -Force
