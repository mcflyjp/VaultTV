Dim scriptDir
scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
Set shell = WScript.CreateObject("WScript.Shell")
shell.Run "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & scriptDir & "tray.ps1""", 0, False
