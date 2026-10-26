import { clipboard } from 'electron';
import { execFile } from 'child_process';
import { logger } from './logger.js';

const WIN_PASTE_SCRIPT = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinPaster {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);
    [DllImport("advapi32.dll")] public static extern bool OpenProcessToken(IntPtr ProcessHandle, uint DesiredAccess, out IntPtr TokenHandle);
    [DllImport("advapi32.dll")] public static extern bool GetTokenInformation(IntPtr TokenHandle, int TokenInformationClass, IntPtr TokenInformation, uint TokenInformationLength, out uint ReturnLength);
    [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr hObject);

    public static bool IsForegroundElevated() {
        IntPtr hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero) return false;
        uint pid = 0;
        GetWindowThreadProcessId(hwnd, out pid);
        if (pid == 0) return false;
        
        IntPtr hProcess = OpenProcess(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, false, pid);
        if (hProcess == IntPtr.Zero) return true;

        IntPtr hToken = IntPtr.Zero;
        bool isElevated = false;
        if (OpenProcessToken(hProcess, 0x0008 /* TOKEN_QUERY */, out hToken)) {
            IntPtr pElevation = Marshal.AllocHGlobal(sizeof(int));
            uint returnLength = 0;
            if (GetTokenInformation(hToken, 20, pElevation, sizeof(int), out returnLength)) {
                int elevation = Marshal.ReadInt32(pElevation);
                isElevated = (elevation != 0);
            }
            Marshal.FreeHGlobal(pElevation);
            CloseHandle(hToken);
        } else {
            isElevated = true;
        }
        CloseHandle(hProcess);
        return isElevated;
    }
}
"@ -ErrorAction SilentlyContinue

if ([WinPaster]::IsForegroundElevated()) {
    Write-Output "ELEVATED"
} else {
    $ws = New-Object -ComObject WScript.Shell
    $ws.SendKeys("^v")
    Write-Output "PASTED"
}
`;

/**
 * Injects text into the currently active window by:
 * 1. Copying text to the system clipboard
 * 2. Checking if target window is elevated
 * 3. Simulating Ctrl+V keystroke (or Cmd+V on macOS) if permissible
 * 
 * Returns { success: boolean, pasted: boolean, reason?: string, message?: string }
 */
export async function pasteTextToActiveWindow(text) {
  if (!text || typeof text !== 'string') {
    return { success: false, pasted: false, message: 'Empty text' };
  }

  try {
    clipboard.writeText(text);
    logger.info(`Text copied to clipboard (${text.length} chars). Triggering paste keystroke...`);

    // Give the clipboard 100ms to register across OS processes
    await new Promise((r) => setTimeout(r, 100));

    if (process.platform === 'win32') {
      return new Promise((resolve) => {
        execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', WIN_PASTE_SCRIPT], { windowsHide: true }, (err, stdout) => {
          if (err) {
            logger.error(`Windows SendKeys paste failed: ${err.message}`);
            resolve({ success: false, pasted: false, reason: 'PASTE_ERROR', message: err.message });
            return;
          }

          const out = stdout.toString().trim();
          if (out.includes('ELEVATED')) {
            logger.warn('Target window is elevated. Skipping SendKeys; text remains on clipboard.');
            resolve({
              success: false,
              pasted: false,
              reason: 'ELEVATED_WINDOW',
              message: "Copied. Couldn't paste into an admin window.",
            });
          } else {
            logger.info('Windows paste keystroke sent successfully.');
            resolve({ success: true, pasted: true });
          }
        });
      });
    } else if (process.platform === 'darwin') {
      return new Promise((resolve) => {
        execFile('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down'], (err) => {
          if (err) {
            logger.error(`macOS osascript paste failed: ${err.message}`);
            resolve({ success: false, pasted: false, message: err.message });
          } else {
            logger.info('macOS paste keystroke sent successfully.');
            resolve({ success: true, pasted: true });
          }
        });
      });
    } else {
      return new Promise((resolve) => {
        execFile('xdotool', ['key', 'ctrl+v'], (err) => {
          if (err) {
            logger.error(`Linux paste failed: ${err.message}`);
            resolve({ success: false, pasted: false, message: err.message });
          } else {
            resolve({ success: true, pasted: true });
          }
        });
      });
    }
  } catch (err) {
    logger.error(`Error in pasteTextToActiveWindow: ${err.message}`);
    return { success: false, pasted: false, message: err.message };
  }
}
