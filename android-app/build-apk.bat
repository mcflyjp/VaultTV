@echo off
REM Build VaultTV debug APK
REM JAVA_HOME points to Android Studio's bundled JBR — no separate JDK install needed

set JAVA_HOME=D:\MEDIA\Programs\Android\Android Studio\jbr
set PATH=%JAVA_HOME%\bin;%PATH%

echo Building debug APK...
call gradlew.bat assembleDebug

if %ERRORLEVEL% EQU 0 (
    echo.
    echo BUILD SUCCESSFUL
    echo APK: app\build\outputs\apk\debug\app-debug.apk
) else (
    echo.
    echo BUILD FAILED
)
