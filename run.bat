@echo off
rem Windows batch wrapper to execute the Bash run script
if not defined BASH_HOME (
  set "BASH_HOME=%ProgramFiles%\\Git\\usr\\bin"
)
"%BASH_HOME%\\bash.exe" "%~dp0run.sh" %*
