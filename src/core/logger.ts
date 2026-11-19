import * as vscode from 'vscode';
import { redactSecrets } from './redact';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

/**
 * Thin wrapper over a VS Code output channel.
 * Rule: nothing is written without passing through redactSecrets().
 */
export class Logger implements vscode.Disposable {
  private readonly channel = vscode.window.createOutputChannel('Portwise');

  constructor(private level: LogLevel = 'info') {}

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  error(message: string): void {
    this.write('error', message);
  }
  warn(message: string): void {
    this.write('warn', message);
  }
  info(message: string): void {
    this.write('info', message);
  }
  debug(message: string): void {
    this.write('debug', message);
  }

  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }

  private write(level: LogLevel, message: string): void {
    if (ORDER[level] > ORDER[this.level]) return;
    const stamp = new Date().toISOString();
    this.channel.appendLine(`${stamp} [${level}] ${redactSecrets(message)}`);
  }
}
