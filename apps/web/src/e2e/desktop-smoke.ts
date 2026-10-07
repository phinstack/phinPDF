/**
 * Desktop smoke test, run inside the Tauri webview by the e2e build in CI.
 * Waits for the launch file to render, then checks the security lockdown and reports
 * back through the e2e-only `e2e_report` command, which exits the app.
 */
import { invoke } from '@tauri-apps/api/core';

const TIMEOUT_MS = 30_000;

async function waitForRender(): Promise<string> {
  const started = Date.now();
  for (;;) {
    const status = document.querySelector('[role=status]');
    const error = document.querySelector('[role=alert]');
    if (error) throw new Error(`app error: ${error.textContent}`);
    if (status?.getAttribute('data-rendered') === 'true') return status.textContent;
    if (Date.now() - started > TIMEOUT_MS) throw new Error('timed out waiting for render');
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function mustFail(fn: () => unknown): Promise<string> {
  try {
    await fn();
    return 'ALLOWED';
  } catch (error) {
    return `blocked: ${String(error).slice(0, 80)}`;
  }
}

export async function runDesktopSmoke(): Promise<void> {
  const result: Record<string, unknown> = { userAgent: navigator.userAgent };
  try {
    result['status'] = await waitForRender();
    result['fsPlugin'] = await mustFail(() =>
      invoke('plugin:fs|read_file', { path: '/etc/passwd' }),
    );
    result['shellPlugin'] = await mustFail(() => invoke('plugin:shell|execute', { program: 'sh' }));
    result['dialogPluginFromWebview'] = await mustFail(() => invoke('plugin:dialog|open', {}));
    result['readUnissuedToken'] = await mustFail(() => invoke('read_file', { id: 'forged-token' }));
    result['network'] = await mustFail(() => fetch('https://example.com/'));
    result['eval'] = await mustFail(() => {
      // Indirect eval: verifying that the CSP blocks it.
      // eslint-disable-next-line no-eval
      (0, eval)('1');
    });
    const leaked = Object.entries(result).filter(([, v]) => v === 'ALLOWED');
    result['ok'] = leaked.length === 0;
  } catch (error) {
    result['ok'] = false;
    result['error'] = String(error);
  }
  await invoke('e2e_report', { result });
}
