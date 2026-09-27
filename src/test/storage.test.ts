import { describe, it, expect, beforeEach } from 'vitest';
import { getStorage, setStorage, clearStorage, sendMessage, type AppStorage } from '../services/storage';
import { fakeChrome, fakeBrowser, resetWebExtensionMocks } from './mocks/webextension';

describe('Storage Service (src/services/storage.ts)', () => {
  beforeEach(() => {
    resetWebExtensionMocks();
  });

  it('sets and retrieves storage values correctly', async () => {
    const data: Partial<AppStorage> = {
      notion_token: 'secret_token_123',
      workspace_name: 'Engineering Hub',
      auto_archive: true,
      player_integration: false,
    };

    await setStorage(data);

    const retrieved = await getStorage(['notion_token', 'workspace_name', 'auto_archive']);
    expect(retrieved).toEqual({
      notion_token: 'secret_token_123',
      workspace_name: 'Engineering Hub',
      auto_archive: true,
    });
  });

  it('clears storage completely', async () => {
    await setStorage({ notion_token: 'to_be_deleted' });
    await clearStorage();

    const result = await getStorage(['notion_token']);
    expect(result).toEqual({});
  });

  it('sends runtime messages and resolves response', async () => {
    fakeBrowser.runtime.onMessage.addListener((msg: unknown) => {
      const payload = msg as { type: string };
      if (payload.type === 'GET_STATUS') {
        return { active: true };
      }
    });

    const response = await sendMessage<{ active: boolean }>({ type: 'GET_STATUS' });
    expect(response).toEqual({ active: true });
  });

  it('rejects sendMessage when chrome.runtime.lastError is set', async () => {
    fakeChrome.runtime.lastError = { message: 'Channel closed before response' };

    await expect(sendMessage({ type: 'TIMEOUT_CALL' })).rejects.toThrow(
      'Channel closed before response'
    );
  });
});
