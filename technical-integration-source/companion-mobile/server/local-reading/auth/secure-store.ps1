param([ValidateSet('init','load','save','self-test')][string]$Action)
$ErrorActionPreference = 'Stop'
$taskStage = 'assembly'
try {
  # Node may inherit a PowerShell 7 module search path. Use this Windows
  # PowerShell runtime's own modules rather than that inherited search path.
  foreach ($taskModule in @('Microsoft.PowerShell.Utility','Microsoft.PowerShell.Management','Microsoft.PowerShell.Security')) {
    Import-Module (Join-Path $PSHOME ('Modules\' + $taskModule + '\' + $taskModule + '.psd1')) -ErrorAction Stop
  }
  Add-Type -AssemblyName System.Security
  $taskStore = Join-Path $env:LOCALAPPDATA 'AuricMechanics\SiwcLocalProof'
  $taskStage = 'directory'
  if (-not (Test-Path -LiteralPath $taskStore)) { New-Item -ItemType Directory -Path $taskStore | Out-Null }
  if ((Get-Item -LiteralPath $taskStore -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Link refused' }
  $taskSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $taskStage = 'directory-acl'
  $taskAcl = Get-Acl -LiteralPath $taskStore
  if ($taskAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $taskSid.Value) { throw 'Unexpected store owner' }
  $taskRules = @($taskAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
  $taskPrivateAcl = $taskAcl.AreAccessRulesProtected -and $taskRules.Count -eq 1 -and $taskRules[0].IdentityReference.Value -eq $taskSid.Value -and $taskRules[0].AccessControlType -eq 'Allow' -and $taskRules[0].FileSystemRights -eq 'FullControl' -and $taskRules[0].InheritanceFlags -eq 'ContainerInherit,ObjectInherit'
  if (-not $taskPrivateAcl) {
    $taskAcl.SetAccessRuleProtection($true,$false)
    foreach ($taskExistingRule in $taskAcl.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier])) { $null = $taskAcl.RemoveAccessRuleSpecific($taskExistingRule) }
    $taskRule = New-Object Security.AccessControl.FileSystemAccessRule($taskSid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    $taskAcl.AddAccessRule($taskRule)
    Set-Acl -LiteralPath $taskStore -AclObject $taskAcl
  }
  $taskStage = 'installation-id'
  $taskHostPath = Join-Path $taskStore 'host-id.json'
  if ((Test-Path -LiteralPath $taskHostPath) -and ((Get-Item -LiteralPath $taskHostPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Link refused' }
  if (-not (Test-Path -LiteralPath $taskHostPath)) {
    $taskHost = @{hostId=('urn:uuid:' + [guid]::NewGuid().ToString())} | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($taskHostPath,$taskHost)
  }
  $taskPath = Join-Path $taskStore 'session.dpapi'
  $taskStage = 'session-path'
  if ((Test-Path -LiteralPath $taskPath) -and ((Get-Item -LiteralPath $taskPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Link refused' }
  if ($Action -eq 'init') { [IO.File]::ReadAllText($taskHostPath); exit 0 }
  if ($Action -eq 'self-test') {
    $taskStage = 'self-test-encrypt'
    $taskBytes = [Text.Encoding]::UTF8.GetBytes('Auric synthetic credential-store test')
    $taskCipher = [Security.Cryptography.ProtectedData]::Protect($taskBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    $taskPlain = [Security.Cryptography.ProtectedData]::Unprotect($taskCipher,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    if ([Convert]::ToBase64String($taskBytes) -ne [Convert]::ToBase64String($taskPlain)) { throw 'DPAPI round trip failed' }
    $taskStage = 'self-test-write-replace'
    $taskProbe = Join-Path $taskStore ('synthetic-probe-' + [guid]::NewGuid().ToString() + '.dpapi')
    $taskProbeNext = $taskProbe + '.next'
    [IO.File]::WriteAllBytes($taskProbe,$taskCipher)
    [IO.File]::WriteAllBytes($taskProbeNext,$taskCipher)
    [IO.File]::Replace($taskProbeNext,$taskProbe,[System.Management.Automation.Language.NullString]::Value)
    $taskRoundtrip = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($taskProbe),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    if ([Convert]::ToBase64String($taskBytes) -ne [Convert]::ToBase64String($taskRoundtrip)) { throw 'DPAPI file round trip failed' }
    [IO.File]::Delete($taskProbe)
    @{ok=$true;mechanism='Windows DPAPI CurrentUser';directoryAcl='current-user-only';plaintextFileWritten=$false;encryptedFileWriteReadAndAtomicReplace=$true} | ConvertTo-Json -Compress
    exit 0
  }
  if ($Action -eq 'load') {
    if (-not (Test-Path -LiteralPath $taskPath)) { 'null'; exit 0 }
    if ((Get-Item -LiteralPath $taskPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Link refused' }
    $taskPlain = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($taskPath),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    [Console]::Out.Write([Text.Encoding]::UTF8.GetString($taskPlain)); exit 0
  }
  $taskStage = 'read-input'
  $taskInput = [Console]::In.ReadToEnd()
  $null = ConvertFrom-Json -InputObject $taskInput
  $taskStage = 'encrypt-input'
  $taskCipher = [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($taskInput),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $taskTemporary = Join-Path $taskStore ('session-' + [guid]::NewGuid().ToString() + '.tmp')
  $taskStage = 'write-encrypted-file'
  [IO.File]::WriteAllBytes($taskTemporary,$taskCipher)
  $taskStage = 'atomic-replace'
  if (Test-Path -LiteralPath $taskPath) { [IO.File]::Replace($taskTemporary,$taskPath,[System.Management.Automation.Language.NullString]::Value) } else { [IO.File]::Move($taskTemporary,$taskPath) }
  '{"ok":true}'
} catch {
  [Console]::Error.WriteLine(('SECURE_STORAGE_UNAVAILABLE stage=' + $taskStage + ' type=' + $_.Exception.GetType().FullName + ' hresult=' + $_.Exception.HResult))
  exit 1
}
