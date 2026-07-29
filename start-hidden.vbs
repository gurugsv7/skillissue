Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

shell.CurrentDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
shell.Run "cmd /c npm start", 0, False