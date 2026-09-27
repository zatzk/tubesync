import { describe, it, expect, vi, beforeEach } from 'vitest';
import browser, {
  fakeBrowser,
  fakeChrome,
  resetWebExtensionMocks,
  getMockStorage,
  setMockStorage,
  mockWebExtension,
} from './webextension';

describe('WebExtension Mock Suite', () => {
  beforeEach(() => {
    resetWebExtensionMocks();
  });

  describe('Storage API (browser.storage.local & sync)', () => {
    it('stores and retrieves data with browser.storage.local.get and set', async () => {
      await browser.storage.local.set({ key1: 'value1', key2: { nested: 42 } });

      const resAllNull = await browser.storage.local.get(null);
      expect(resAllNull).toEqual({ key1: 'value1', key2: { nested: 42 } });

      const resAllUndefined = await browser.storage.local.get(undefined);
      expect(resAllUndefined).toEqual({ key1: 'value1', key2: { nested: 42 } });

      const resNoArgs = await browser.storage.local.get();
      expect(resNoArgs).toEqual({ key1: 'value1', key2: { nested: 42 } });

      const resString = await browser.storage.local.get('key1');
      expect(resString).toEqual({ key1: 'value1' });

      const resMissing = await browser.storage.local.get('nonexistent');
      expect(resMissing).toEqual({});

      const resArray = await browser.storage.local.get(['key1', 'key2', 'missing']);
      expect(resArray).toEqual({ key1: 'value1', key2: { nested: 42 } });

      const resObject = await browser.storage.local.get({
        key1: 'fallback1',
        key3: 'fallback3',
      });
      expect(resObject).toEqual({ key1: 'value1', key3: 'fallback3' });
    });

    it('removes keys and clears storage', async () => {
      await browser.storage.local.set({ a: 1, b: 2, c: 3 });

      await browser.storage.local.remove('a');
      expect(await browser.storage.local.get()).toEqual({ b: 2, c: 3 });

      // Removing nonexistent key does not fail or emit false changes
      await browser.storage.local.remove('nonexistent');
      expect(await browser.storage.local.get()).toEqual({ b: 2, c: 3 });

      await browser.storage.local.remove(['b']);
      expect(await browser.storage.local.get()).toEqual({ c: 3 });

      await browser.storage.local.clear();
      expect(await browser.storage.local.get()).toEqual({});

      // Clearing empty storage does not crash
      await browser.storage.local.clear();
      expect(await browser.storage.local.get()).toEqual({});
    });

    it('handles empty set payload without error', async () => {
      await browser.storage.local.set({});
      expect(await browser.storage.local.get()).toEqual({});
    });

    it('triggers onChanged listeners on local storage and top-level storage', async () => {
      const localListener = vi.fn();
      const globalListener = vi.fn();

      browser.storage.local.onChanged.addListener(localListener);
      browser.storage.onChanged.addListener(globalListener);

      expect(browser.storage.local.onChanged.hasListener(localListener)).toBe(true);
      expect(browser.storage.onChanged.hasListener(globalListener)).toBe(true);

      await browser.storage.local.set({ user: 'Alice' });

      expect(localListener).toHaveBeenCalledTimes(1);
      expect(localListener).toHaveBeenCalledWith({
        user: { oldValue: undefined, newValue: 'Alice' },
      });

      expect(globalListener).toHaveBeenCalledTimes(1);
      expect(globalListener).toHaveBeenCalledWith(
        { user: { oldValue: undefined, newValue: 'Alice' } },
        'local'
      );

      // Modify existing
      await browser.storage.local.set({ user: 'Bob' });
      expect(localListener).toHaveBeenCalledWith({
        user: { oldValue: 'Alice', newValue: 'Bob' },
      });

      // No-op if value is identical
      localListener.mockClear();
      await browser.storage.local.set({ user: 'Bob' });
      expect(localListener).not.toHaveBeenCalled();

      // Remove listener
      browser.storage.local.onChanged.removeListener(localListener);
      expect(browser.storage.local.onChanged.hasListener(localListener)).toBe(false);

      await browser.storage.local.remove('user');
      expect(localListener).not.toHaveBeenCalled();
      expect(globalListener).toHaveBeenCalledWith(
        { user: { oldValue: 'Bob' } },
        'local'
      );

      browser.storage.onChanged.removeListener(globalListener);
      expect(browser.storage.onChanged.hasListener(globalListener)).toBe(false);
    });

    it('operates on sync storage independently', async () => {
      await browser.storage.sync.set({ syncedOption: true });
      expect(await browser.storage.sync.get('syncedOption')).toEqual({ syncedOption: true });
      expect(await browser.storage.local.get('syncedOption')).toEqual({});

      await browser.storage.sync.clear();
      expect(await browser.storage.sync.get()).toEqual({});
    });

    it('supports direct mock storage inspection and seeding helpers', () => {
      setMockStorage({ pref: 'dark' }, 'local');
      setMockStorage({ cloudPref: 'enabled' }, 'sync');

      expect(getMockStorage('local')).toEqual({ pref: 'dark' });
      expect(getMockStorage('sync')).toEqual({ cloudPref: 'enabled' });
    });
  });

  describe('Runtime API (browser.runtime)', () => {
    it('provides runtime id and resolves getURL properly', () => {
      expect(browser.runtime.id).toBe('mock-tubesync-extension-id');
      expect(browser.runtime.lastError).toBeNull();
      browser.runtime.lastError = { message: 'temporary error' };
      expect(browser.runtime.lastError.message).toBe('temporary error');
      browser.runtime.lastError = null;

      expect(browser.runtime.getURL('popup.html')).toBe(
        'chrome-extension://mock-tubesync-extension-id/popup.html'
      );
      expect(browser.runtime.getURL('/icons/icon.png')).toBe(
        'chrome-extension://mock-tubesync-extension-id/icons/icon.png'
      );
    });

    it('handles onInstalled events and trigger helper', async () => {
      const onInstallListener = vi.fn();
      browser.runtime.onInstalled.addListener(onInstallListener);

      expect(browser.runtime.onInstalled.hasListener(onInstallListener)).toBe(true);

      await browser.runtime.onInstalled.trigger({ reason: 'install' });
      expect(onInstallListener).toHaveBeenCalledWith({ reason: 'install' });

      browser.runtime.onInstalled.removeListener(onInstallListener);
      expect(browser.runtime.onInstalled.hasListener(onInstallListener)).toBe(false);

      await browser.runtime.onInstalled.trigger({ reason: 'update' });
      expect(onInstallListener).toHaveBeenCalledTimes(1);

      // Default trigger details
      await browser.runtime.onInstalled.trigger();
    });

    it('handles sendMessage with synchronous listener return', async () => {
      const listener = vi.fn((msg) => {
        if (msg.type === 'PING') return { reply: 'PONG' };
      });

      browser.runtime.onMessage.addListener(listener);
      expect(browser.runtime.onMessage.hasListener(listener)).toBe(true);

      const response = await browser.runtime.sendMessage({ type: 'PING' });
      expect(response).toEqual({ reply: 'PONG' });
      expect(listener).toHaveBeenCalled();

      browser.runtime.onMessage.removeListener(listener);
      expect(browser.runtime.onMessage.hasListener(listener)).toBe(false);
    });

    it('handles sendMessage with Promise return in listener', async () => {
      const listener = vi.fn(async (msg) => {
        if (msg.type === 'ASYNC_GET') {
          return { data: 'async_data' };
        }
      });

      browser.runtime.onMessage.addListener(listener);

      const response = await browser.runtime.sendMessage({ type: 'ASYNC_GET' });
      expect(response).toEqual({ data: 'async_data' });
    });

    it('handles sendMessage when listener returns a rejected Promise', async () => {
      const listener = vi.fn(async (msg) => {
        if (msg.type === 'FAIL_ASYNC') {
          throw new Error('Async rejection');
        }
      });

      browser.runtime.onMessage.addListener(listener);

      const response = await browser.runtime.sendMessage({ type: 'FAIL_ASYNC' });
      expect(response).toEqual({ success: false, error: 'Async rejection' });
    });

    it('handles sendMessage with sendResponse callback when returning true', async () => {
      const listener = vi.fn((msg, _sender, sendResponse) => {
        if (msg.type === 'CALLBACK_TEST') {
          setTimeout(() => sendResponse({ status: 'done' }), 10);
          return true;
        }
      });

      browser.runtime.onMessage.addListener(listener);

      const response = await browser.runtime.sendMessage({ type: 'CALLBACK_TEST' });
      expect(response).toEqual({ status: 'done' });
    });

    it('catches listener errors and returns formatted error object', async () => {
      const listener = vi.fn((msg) => {
        if (msg.type === 'THROW_ERR') {
          throw new Error('Listener failed');
        }
        if (msg.type === 'THROW_STR') {
          throw 'Non-error string failure';
        }
      });

      browser.runtime.onMessage.addListener(listener);

      const resError = await browser.runtime.sendMessage({ type: 'THROW_ERR' });
      expect(resError).toEqual({ success: false, error: 'Listener failed' });

      const resStr = await browser.runtime.sendMessage({ type: 'THROW_STR' });
      expect(resStr).toEqual({ success: false, error: 'Non-error string failure' });
    });

    it('returns undefined if no listeners respond or listener returns void', async () => {
      const noopListener = vi.fn(() => {});
      browser.runtime.onMessage.addListener(noopListener);

      const response = await browser.runtime.sendMessage({ type: 'UNHANDLED' });
      expect(response).toBeUndefined();
    });
  });

  describe('Identity API (browser.identity)', () => {
    it('constructs redirect URL properly', () => {
      const redirect = browser.identity.getRedirectURL('notion');
      expect(redirect).toBe('https://mock-tubesync-extension-id.chromiumapp.org/notion');

      const rootRedirect = browser.identity.getRedirectURL();
      expect(rootRedirect).toBe('https://mock-tubesync-extension-id.chromiumapp.org/');
    });

    it('simulates launchWebAuthFlow successfully', async () => {
      const url = await browser.identity.launchWebAuthFlow({
        url: 'https://api.notion.com/v1/oauth/authorize?client_id=123',
        interactive: true,
      });

      expect(url).toContain('code=mock_oauth_code');
      expect(url).toContain('state=mock_state');
    });

    it('allows customizing mock auth URL', async () => {
      mockWebExtension.setMockAuthUrl('https://callback.test/?code=custom_code');

      const url = await browser.identity.launchWebAuthFlow({
        url: 'https://example.com/oauth',
      });
      expect(url).toBe('https://callback.test/?code=custom_code');
    });

    it('throws error when URL is missing', async () => {
      await expect(
        browser.identity.launchWebAuthFlow({ url: '' })
      ).rejects.toThrow('Missing URL for launchWebAuthFlow');
    });
  });

  describe('ContextMenus API (browser.contextMenus)', () => {
    it('creates, updates, retrieves, and removes context menu items', async () => {
      const cbCreate = vi.fn();
      const menuId = browser.contextMenus.create(
        {
          id: 'test-menu',
          title: 'Test Menu',
          contexts: ['link'],
        },
        cbCreate
      );

      expect(menuId).toBe('test-menu');
      expect(cbCreate).toHaveBeenCalled();
      expect(mockWebExtension.getContextMenuItem('test-menu')?.title).toBe('Test Menu');
      expect(mockWebExtension.getAllContextMenuItems()).toHaveLength(1);

      // Auto generate id without callback
      const autoId = browser.contextMenus.create({ title: 'Auto Generated' });
      expect(autoId).toBeDefined();

      const cbUpdate = vi.fn();
      await browser.contextMenus.update('test-menu', { title: 'Updated Menu' }, cbUpdate);
      expect(cbUpdate).toHaveBeenCalled();
      expect(mockWebExtension.getContextMenuItem('test-menu')?.title).toBe('Updated Menu');

      // Update without callback & update nonexistent
      await browser.contextMenus.update('test-menu', { title: 'Updated Again' });
      await browser.contextMenus.update('nonexistent', { title: 'Nope' });

      const cbRemove = vi.fn();
      await browser.contextMenus.remove('test-menu', cbRemove);
      expect(cbRemove).toHaveBeenCalled();
      expect(mockWebExtension.getContextMenuItem('test-menu')).toBeUndefined();

      // Remove without callback
      await browser.contextMenus.remove(autoId);

      browser.contextMenus.create({ id: 'item1', title: '1' });
      browser.contextMenus.create({ id: 'item2', title: '2' });
      expect(mockWebExtension.getAllContextMenuItems()).toHaveLength(2);

      const cbRemoveAll = vi.fn();
      await browser.contextMenus.removeAll(cbRemoveAll);
      expect(cbRemoveAll).toHaveBeenCalled();
      expect(mockWebExtension.getAllContextMenuItems()).toHaveLength(0);

      // removeAll without callback
      await browser.contextMenus.removeAll();
    });

    it('handles onClicked event dispatch and trigger helper', async () => {
      const clickListener = vi.fn();
      browser.contextMenus.onClicked.addListener(clickListener);

      expect(browser.contextMenus.onClicked.hasListener(clickListener)).toBe(true);

      const clickInfo = {
        menuItemId: 'save-video',
        linkUrl: 'https://youtube.com/watch?v=123',
      };
      await browser.contextMenus.onClicked.trigger(clickInfo);

      expect(clickListener).toHaveBeenCalledWith(clickInfo, undefined);

      browser.contextMenus.onClicked.removeListener(clickListener);
      expect(browser.contextMenus.onClicked.hasListener(clickListener)).toBe(false);
    });
  });

  describe('Chrome Compatibility Layer (fakeChrome)', () => {
    it('supports chrome.storage.local callback API and Promise API', async () => {
      // With callbacks
      await new Promise<void>((resolve) => {
        fakeChrome.storage.local.set({ token: 'xyz123' }, () => {
          resolve();
        });
      });

      const result = await new Promise<Record<string, unknown>>((resolve) => {
        fakeChrome.storage.local.get('token', (res) => {
          resolve(res);
        });
      });
      expect(result).toEqual({ token: 'xyz123' });

      await new Promise<void>((resolve) => {
        fakeChrome.storage.local.remove('token', () => {
          resolve();
        });
      });

      // Without callbacks (Promises)
      await fakeChrome.storage.local.set({ direct: 'yes' });
      const directRes = await fakeChrome.storage.local.get('direct');
      expect(directRes).toEqual({ direct: 'yes' });

      await fakeChrome.storage.local.remove('direct');
      await fakeChrome.storage.local.clear();
      expect(await fakeChrome.storage.local.get()).toEqual({});
    });

    it('supports chrome.storage.sync callback and Promise API', async () => {
      await new Promise<void>((resolve) => {
        fakeChrome.storage.sync.set({ syncVal: 'remote' }, () => {
          resolve();
        });
      });

      const syncResult = await new Promise<Record<string, unknown>>((resolve) => {
        fakeChrome.storage.sync.get('syncVal', (res) => {
          resolve(res);
        });
      });
      expect(syncResult).toEqual({ syncVal: 'remote' });

      await new Promise<void>((resolve) => {
        fakeChrome.storage.sync.remove('syncVal', () => {
          resolve();
        });
      });

      await fakeChrome.storage.sync.set({ pSync: 123 });
      expect(await fakeChrome.storage.sync.get('pSync')).toEqual({ pSync: 123 });

      await new Promise<void>((resolve) => {
        fakeChrome.storage.sync.clear(() => {
          resolve();
        });
      });
      expect(await fakeChrome.storage.sync.get()).toEqual({});

      await fakeChrome.storage.sync.clear();
      await fakeChrome.storage.sync.remove('none');
    });

    it('supports chrome.runtime.sendMessage with and without callback', async () => {
      fakeBrowser.runtime.onMessage.addListener((msg) => {
        const payload = msg as { action: string };
        if (payload.action === 'HELLO') return { message: 'WORLD' };
      });

      // With callback
      const responseWithCb = await new Promise((resolve) => {
        fakeChrome.runtime.sendMessage({ action: 'HELLO' }, (res) => {
          resolve(res);
        });
      });
      expect(responseWithCb).toEqual({ message: 'WORLD' });

      // Without callback (Promise)
      const responsePromise = await fakeChrome.runtime.sendMessage({ action: 'HELLO' });
      expect(responsePromise).toEqual({ message: 'WORLD' });
    });

    it('handles chrome.runtime.lastError in callback', async () => {
      fakeChrome.runtime.lastError = { message: 'Could not establish connection' };

      const response = await new Promise((resolve) => {
        fakeChrome.runtime.sendMessage({ action: 'FAIL' }, (res) => {
          resolve(res);
        });
      });

      expect(response).toBeUndefined();
      expect(fakeChrome.runtime.lastError?.message).toBe('Could not establish connection');
    });

    it('provides chrome.identity and chrome.contextMenus delegations', () => {
      expect(fakeChrome.identity.getRedirectURL()).toContain('chromiumapp.org');
      expect(fakeChrome.contextMenus.create).toBeDefined();
    });
  });
});
