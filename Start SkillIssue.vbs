Option Explicit

Dim shell, fileSystem, projectDirectory

Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

projectDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = projectDirectory

' Window style 0 keeps the command prompt hidden. False lets the app keep
' running after this launcher exits.
shell.Run "cmd.exe /d /s /c ""npm start""", 0, False

