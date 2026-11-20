import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GatewayPanelState, PanelState, WebviewToHost } from '../src/shared/protocol';

/** Small DOM surface used by the renderer, with no browser or additional dependency. */
class Element {
  className = '';
  id = '';
  type = '';
  disabled = false;
  children: Element[] = [];
  attributes = new Map<string, string>();
  private text = '';
  private clickHandler: (() => void) | undefined;
  readonly classList = { add: (name: string) => { this.className += ` ${name}`; } };

  constructor(readonly tag: string) {}
  set textContent(value: string) { this.text = value; this.children = []; }
  get textContent(): string { return this.text + this.children.map((child) => child.textContent).join(''); }
  append(...children: Element[]): void { this.children.push(...children); }
  prepend(child: Element): void {
    if (this.text) {
      const textNode = new Element('#text'); textNode.textContent = this.text;
      this.text = ''; this.children.unshift(textNode);
    }
    this.children.unshift(child);
  }
  replaceChildren(...children: Element[]): void { this.text = ''; this.children = children; }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  addEventListener(event: string, handler: () => void): void { if (event === 'click') this.clickHandler = handler; }
  click(): void { if (!this.disabled) this.clickHandler?.(); }
  all(): Element[] { return [this, ...this.children.flatMap((child) => child.all())]; }
  withClass(name: string): Element[] { return this.all().filter((node) => node.className.split(' ').includes(name)); }
}

async function panel() {
  vi.resetModules();
  const root = new Element('main');
  const messages: WebviewToHost[] = [];
  let receive: ((event: { data: unknown }) => void) | undefined;
  vi.stubGlobal('document', { getElementById: () => root, createElement: (tag: string) => new Element(tag) });
  vi.stubGlobal('window', { addEventListener: (_event: string, handler: (event: { data: unknown }) => void) => { receive = handler; } });
  vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: (message: WebviewToHost) => messages.push(message) }));
  const entry = '../src/webview-ui/main';
  await import(entry);
  const render = (overrides: Partial<PanelState> = {}) => receive?.({ data: { type: 'state', state: {
    version: 'test', status: 'Ready.', providers: [], accounts: [], gateway: { running: false, label: 'Stopped' }, ...overrides,
  } } });
  return { root, messages, render };
}

afterEach(() => vi.unstubAllGlobals());

describe('minimal list panel rendering', () => {
  it('uses the container title and keeps an accessible name without repeating a visible title', async () => {
    const { root } = await panel();
    expect(root.attributes.get('aria-label')).toBe('Portwise');
    expect(root.all().some((node) => node.tag === 'h1')).toBe(false);
  });
  it('announces only the latest plain-text Activity message and hides the prompt', async () => {
    const { root, render } = await panel();
    render({ status: 'Provider added.' });
    render({ status: 'The provider action failed. Check the Portwise log for details.' });
    const message = root.withClass('activity-message');
    expect(message).toHaveLength(1);
    expect(message[0]?.attributes.get('role')).toBe('status');
    expect(message[0]?.attributes.get('aria-live')).toBe('polite');
    expect(message[0]?.textContent).toBe('Error: The provider action failed. Check the Portwise log for details.');
    expect(message[0]?.className).toContain('activity-error');
    expect(root.textContent).not.toContain('Provider added.');
    const prompt = root.withClass('activity-prompt')[0];
    expect(prompt?.textContent).toBe('>');
    expect(prompt?.attributes.get('aria-hidden')).toBe('true');
    render({ status: 'Ready.' });
    expect(root.withClass('activity-error')).toHaveLength(0);
    expect(root.withClass('activity-message')[0]?.textContent).toBe('Ready.');
  });

  it.each<[GatewayPanelState, string, string, boolean, boolean]>([
    [{ running: true, label: 'Running on port 47831' }, 'running', '▶', true, false],
    [{ running: false, label: 'Stopped' }, 'stopped', '■', false, true],
    [{ running: false, label: 'Error: port conflict' }, 'error', '!', false, false],
    [{ running: false, label: 'Unknown' }, 'unknown', '?', false, false],
  ])('keeps gateway text, icon and existing button rules for %s', async (gateway, state, icon, startDisabled, stopDisabled) => {
    const { root, render } = await panel(); render({ gateway });
    const badge = root.withClass(`gateway-status-${state}`)[0];
    expect(badge?.textContent).toBe(icon + gateway.label);
    expect(badge?.attributes.get('aria-label')).toBe(`Gateway ${gateway.label}`);
    const buttons = root.all().filter((node) => node.tag === 'button');
    const start = buttons.find((node) => node.textContent === 'Start gateway');
    const stop = buttons.find((node) => node.textContent === 'Stop gateway');
    expect(start?.disabled).toBe(startDisabled);
    expect(stop?.disabled).toBe(stopDisabled);
    expect(start?.className.includes('button-primary')).toBe(state === 'stopped');
    for (const button of [start, stop]) {
      if (button?.disabled) {
        expect(button.attributes.get('aria-describedby')).toBe('gateway-state-reason');
        expect(root.all().find((node) => node.id === 'gateway-state-reason')?.textContent).not.toBe('');
      }
    }
  });

  it('renders long and HTML-like names and Activity as literal text; preserves action order and payloads', async () => {
    const { root, messages, render } = await panel();
    const name = '<img onerror=alert(1)>' + 'long-name-'.repeat(20);
    render({ status: name, accounts: [{ id: 'random-account', name }], providers: [{ id: 'random-provider', name, enabled: true, baseUrl: 'https://example.test', tokenMask: '••••0000' }] });
    expect(root.withClass('provider-name')[0]?.textContent).toBe(name);
    expect(root.withClass('account-row')[0]?.textContent).toBe(name);
    expect(root.withClass('activity-message')[0]?.textContent).toBe(name);
    expect(root.all().some((node) => node.tag === 'img' || node.tag === 'script')).toBe(false);
    const buttons = root.all().filter((node) => node.tag === 'button');
    expect(buttons.map((node) => node.textContent)).toEqual(['Start gateway', 'Stop gateway', 'Configure Codex home', 'Add via Codex Login', 'Save Current', 'Switch', 'Remove', 'Add provider', 'Edit provider', 'Disable provider', 'Test provider connection', 'Delete provider']);
    buttons.find((node) => node.textContent === 'Switch')?.click();
    expect(messages.at(-1)).toEqual({ type: 'runPanelCommand', command: 'portwise.switchCodexAccount' });
    buttons.find((node) => node.textContent === 'Delete provider')?.click();
    expect(messages.at(-1)).toEqual({ type: 'deleteProvider', id: 'random-provider' });
    expect(root.withClass('button-destructive').map((node) => node.textContent)).toEqual(['Remove', 'Delete provider']);
  });

  it('keeps empty account and provider copy and the existing Add provider action', async () => {
    const { root, messages, render } = await panel(); render();
    expect(root.textContent).toContain('No saved accounts yet.');
    expect(root.textContent).toContain('No provider profiles yet.');
    expect(root.withClass('provider')).toHaveLength(0);
    root.withClass('empty-state')[0]?.all().find((node) => node.tag === 'button')?.click();
    expect(messages.at(-1)).toEqual({ type: 'addProvider' });
  });
});
