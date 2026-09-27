import { vi } from 'vitest';

export type StorageArea = 'local' | 'sync';

export interface StorageChange<T = unknown> {
  oldValue?: T;
  newValue?: T;
}

export type StorageChanges = Record<string, StorageChange>;

export type StorageListener = (changes: StorageChanges, areaName: StorageArea) => void;
export type StorageAreaListener = (changes: StorageChanges) => void;

export interface MessageSender {
  id?: string;
  url?: string;
  tlsChannelId?: string;
  tab?: {
    id?: number;
    url?: string;
    title?: string;
  };
  frameId?: number;
}

export type MessageResponseCallback = (response?: unknown) => void;

export type MessageListener = (
  message: unknown,
  sender: MessageSender,
  sendResponse: MessageResponseCallback
) => unknown;

export interface InstalledDetails {
  reason: 'install' | 'update' | 'chrome_update' | 'shared_module_update';
  previousVersion?: string;
  temporary?: boolean;
}

export type InstalledListener = (details: InstalledDetails) => void;

export interface WebAuthFlowOptions {
  url: string;
  interactive?: boolean;
}

export interface ContextMenuCreateProperties {
  id?: string | number;
  title?: string;
  contexts?: string[];
  documentUrlPatterns?: string[];
  onclick?: (info: ContextMenuClickInfo, tab?: unknown) => void;
  type?: 'normal' | 'checkbox' | 'radio' | 'separator';
  parentId?: string | number;
  checked?: boolean;
  enabled?: boolean;
  visible?: boolean;
}

export type ContextMenuUpdateProperties = Partial<ContextMenuCreateProperties>;

export interface ContextMenuClickInfo {
  menuItemId: string | number;
  parentMenuItemId?: string | number;
  mediaType?: string;
  linkUrl?: string;
  srcUrl?: string;
  pageUrl?: string;
  frameUrl?: string;
  selectionText?: string;
  editable?: boolean;
  checked?: boolean;
  wasChecked?: boolean;
  button?: number;
}

export type ContextMenuClickListener = (info: ContextMenuClickInfo, tab?: unknown) => void;

function deepClone<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

class StorageAreaMock {
  private data = new Map<string, unknown>();
  private listeners = new Set<StorageAreaListener>();
  private readonly areaName: StorageArea;
  private readonly notifyGlobalListeners: (changes: StorageChanges, area: StorageArea) => void;

  constructor(
    areaName: StorageArea,
    notifyGlobalListeners: (changes: StorageChanges, area: StorageArea) => void
  ) {
    this.areaName = areaName;
    this.notifyGlobalListeners = notifyGlobalListeners;
  }

  async get(
    keys?: null | string | string[] | Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};

    if (keys === null || keys === undefined) {
      for (const [k, v] of this.data.entries()) {
        result[k] = deepClone(v);
      }
      return result;
    }

    if (typeof keys === 'string') {
      if (this.data.has(keys)) {
        result[keys] = deepClone(this.data.get(keys));
      }
      return result;
    }

    if (Array.isArray(keys)) {
      for (const key of keys) {
        if (this.data.has(key)) {
          result[key] = deepClone(this.data.get(key));
        }
      }
      return result;
    }

    if (typeof keys === 'object') {
      for (const [key, defaultVal] of Object.entries(keys)) {
        if (this.data.has(key)) {
          result[key] = deepClone(this.data.get(key));
        } else {
          result[key] = deepClone(defaultVal);
        }
      }
    }

    return result;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    const changes: StorageChanges = {};

    for (const [key, value] of Object.entries(items)) {
      const oldValue = this.data.get(key);
      const clonedNew = deepClone(value);

      if (JSON.stringify(oldValue) !== JSON.stringify(clonedNew)) {
        changes[key] = {
          oldValue: deepClone(oldValue),
          newValue: clonedNew,
        };
        this.data.set(key, clonedNew);
      }
    }

    if (Object.keys(changes).length > 0) {
      this.dispatchChanges(changes);
    }
  }

  async remove(keys: string | string[]): Promise<void> {
    const changes: StorageChanges = {};
    const keyList = Array.isArray(keys) ? keys : [keys];

    for (const key of keyList) {
      if (this.data.has(key)) {
        changes[key] = {
          oldValue: deepClone(this.data.get(key)),
        };
        this.data.delete(key);
      }
    }

    if (Object.keys(changes).length > 0) {
      this.dispatchChanges(changes);
    }
  }

  async clear(): Promise<void> {
    const changes: StorageChanges = {};

    for (const [key, value] of this.data.entries()) {
      changes[key] = {
        oldValue: deepClone(value),
      };
    }

    this.data.clear();

    if (Object.keys(changes).length > 0) {
      this.dispatchChanges(changes);
    }
  }

  private dispatchChanges(changes: StorageChanges): void {
    for (const listener of this.listeners) {
      listener(changes);
    }
    this.notifyGlobalListeners(changes, this.areaName);
  }

  onChanged = {
    addListener: vi.fn((listener: StorageAreaListener) => {
      this.listeners.add(listener);
    }),
    removeListener: vi.fn((listener: StorageAreaListener) => {
      this.listeners.delete(listener);
    }),
    hasListener: vi.fn((listener: StorageAreaListener): boolean => {
      return this.listeners.has(listener);
    }),
  };

  // Helper methods for inspection & test setup
  _getData(): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of this.data.entries()) {
      obj[k] = deepClone(v);
    }
    return obj;
  }

  _setData(data: Record<string, unknown>): void {
    this.data.clear();
    for (const [k, v] of Object.entries(data)) {
      this.data.set(k, deepClone(v));
    }
  }

  _reset(): void {
    this.data.clear();
    this.listeners.clear();
    this.onChanged.addListener.mockClear();
    this.onChanged.removeListener.mockClear();
    this.onChanged.hasListener.mockClear();
  }
}

export class WebExtensionMock {
  public readonly runtimeId = 'mock-tubesync-extension-id';
  public lastError: { message: string } | null = null;

  private globalStorageListeners = new Set<StorageListener>();
  private messageListeners = new Set<MessageListener>();
  private installedListeners = new Set<InstalledListener>();
  private contextMenuListeners = new Set<ContextMenuClickListener>();
  private contextMenuItems = new Map<string | number, ContextMenuCreateProperties>();
  private mockAuthUrl = 'https://mock-tubesync-extension-id.chromiumapp.org/?code=mock_oauth_code&state=mock_state';

  public readonly localStorage: StorageAreaMock;
  public readonly syncStorage: StorageAreaMock;

  constructor() {
    const notifyGlobal = (changes: StorageChanges, area: StorageArea) => {
      for (const listener of this.globalStorageListeners) {
        listener(changes, area);
      }
    };

    this.localStorage = new StorageAreaMock('local', notifyGlobal);
    this.syncStorage = new StorageAreaMock('sync', notifyGlobal);
  }

  // --- browser.storage ---
  get storage() {
    return {
      local: this.localStorage,
      sync: this.syncStorage,
      onChanged: {
        addListener: vi.fn((listener: StorageListener) => {
          this.globalStorageListeners.add(listener);
        }),
        removeListener: vi.fn((listener: StorageListener) => {
          this.globalStorageListeners.delete(listener);
        }),
        hasListener: vi.fn((listener: StorageListener): boolean => {
          return this.globalStorageListeners.has(listener);
        }),
      },
    };
  }

  // --- browser.runtime ---
  get runtime() {
    return {
      id: this.runtimeId,
      get lastError() {
        return mockWebExtension.lastError;
      },
      set lastError(val: { message: string } | null) {
        mockWebExtension.lastError = val;
      },
      getURL: vi.fn((path: string): string => {
        const cleanPath = path.replace(/^\//, '');
        return `chrome-extension://${this.runtimeId}/${cleanPath}`;
      }),
      sendMessage: vi.fn(async (message: unknown): Promise<unknown> => {
        return this.dispatchMessage(message);
      }),
      onMessage: {
        addListener: vi.fn((listener: MessageListener) => {
          this.messageListeners.add(listener);
        }),
        removeListener: vi.fn((listener: MessageListener) => {
          this.messageListeners.delete(listener);
        }),
        hasListener: vi.fn((listener: MessageListener): boolean => {
          return this.messageListeners.has(listener);
        }),
      },
      onInstalled: {
        addListener: vi.fn((listener: InstalledListener) => {
          this.installedListeners.add(listener);
        }),
        removeListener: vi.fn((listener: InstalledListener) => {
          this.installedListeners.delete(listener);
        }),
        hasListener: vi.fn((listener: InstalledListener): boolean => {
          return this.installedListeners.has(listener);
        }),
        trigger: vi.fn(async (details?: Partial<InstalledDetails>): Promise<void> => {
          const finalDetails: InstalledDetails = {
            reason: 'install',
            ...details,
          };
          for (const listener of this.installedListeners) {
            listener(finalDetails);
          }
        }),
      },
      _lastError: this.lastError,
    };
  }

  // --- browser.identity ---
  get identity() {
    return {
      getRedirectURL: vi.fn((path?: string): string => {
        const suffix = path ? path.replace(/^\//, '') : '';
        return `https://${this.runtimeId}.chromiumapp.org/${suffix}`;
      }),
      launchWebAuthFlow: vi.fn(async (options: WebAuthFlowOptions): Promise<string> => {
        if (!options.url) {
          throw new Error('Missing URL for launchWebAuthFlow');
        }
        return this.mockAuthUrl;
      }),
    };
  }

  // --- browser.contextMenus ---
  get contextMenus() {
    return {
      create: vi.fn((properties: ContextMenuCreateProperties, callback?: () => void): string | number => {
        const id = properties.id ?? `menu_${this.contextMenuItems.size + 1}`;
        const item: ContextMenuCreateProperties = { ...properties, id };
        this.contextMenuItems.set(id, item);
        if (callback) {
          callback();
        }
        return id;
      }),
      update: vi.fn(async (id: string | number, properties: ContextMenuUpdateProperties, callback?: () => void): Promise<void> => {
        const existing = this.contextMenuItems.get(id);
        if (existing) {
          this.contextMenuItems.set(id, { ...existing, ...properties });
        }
        if (callback) {
          callback();
        }
      }),
      remove: vi.fn(async (id: string | number, callback?: () => void): Promise<void> => {
        this.contextMenuItems.delete(id);
        if (callback) {
          callback();
        }
      }),
      removeAll: vi.fn(async (callback?: () => void): Promise<void> => {
        this.contextMenuItems.clear();
        if (callback) {
          callback();
        }
      }),
      onClicked: {
        addListener: vi.fn((listener: ContextMenuClickListener) => {
          this.contextMenuListeners.add(listener);
        }),
        removeListener: vi.fn((listener: ContextMenuClickListener) => {
          this.contextMenuListeners.delete(listener);
        }),
        hasListener: vi.fn((listener: ContextMenuClickListener): boolean => {
          return this.contextMenuListeners.has(listener);
        }),
        trigger: vi.fn(async (info: ContextMenuClickInfo, tab?: unknown): Promise<void> => {
          for (const listener of this.contextMenuListeners) {
            listener(info, tab);
          }
        }),
      },
    };
  }

  // --- Internal Messaging Dispatcher ---
  public async dispatchMessage(
    message: unknown,
    senderOverride?: Partial<MessageSender>
  ): Promise<unknown> {
    const sender: MessageSender = {
      id: this.runtimeId,
      url: `chrome-extension://${this.runtimeId}/index.html`,
      ...senderOverride,
    };

    const promises: Promise<unknown>[] = [];

    for (const listener of this.messageListeners) {
      const responsePromise = new Promise<unknown>((resolve) => {
        const sendResponse: MessageResponseCallback = (resp) => {
          resolve(resp);
        };

        try {
          const returnValue = listener(message, sender, sendResponse);

          if (returnValue && typeof (returnValue as Promise<unknown>).then === 'function') {
            (returnValue as Promise<unknown>).then(resolve).catch((err) => {
              resolve({ success: false, error: err instanceof Error ? err.message : String(err) });
            });
          } else if (returnValue === true) {
            // Async response via sendResponse callback
          } else {
            resolve(returnValue);
          }
        } catch (err) {
          resolve({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
      });

      promises.push(responsePromise);
    }

    if (promises.length === 0) {
      return undefined;
    }

    // Return first resolved listener response
    return Promise.race(promises);
  }

  public setMockAuthUrl(url: string): void {
    this.mockAuthUrl = url;
  }

  public getContextMenuItem(id: string | number): ContextMenuCreateProperties | undefined {
    return this.contextMenuItems.get(id);
  }

  public getAllContextMenuItems(): ContextMenuCreateProperties[] {
    return Array.from(this.contextMenuItems.values());
  }

  public reset(): void {
    this.localStorage._reset();
    this.syncStorage._reset();
    this.globalStorageListeners.clear();
    this.messageListeners.clear();
    this.installedListeners.clear();
    this.contextMenuListeners.clear();
    this.contextMenuItems.clear();
    this.lastError = null;
    this.mockAuthUrl = `https://${this.runtimeId}.chromiumapp.org/?code=mock_oauth_code&state=mock_state`;
  }
}

// Global Singleton Instance
export const mockWebExtension = new WebExtensionMock();

// Browser API (Promises / WebExtension Polyfill compatible)
export const fakeBrowser = {
  get storage() {
    return mockWebExtension.storage;
  },
  get runtime() {
    return mockWebExtension.runtime;
  },
  get identity() {
    return mockWebExtension.identity;
  },
  get contextMenus() {
    return mockWebExtension.contextMenus;
  },
  Menus: {} as Record<string, unknown>,
};

// Chrome API (Callback & Promise compatible)
export const fakeChrome = {
  get storage() {
    return {
      local: {
        get: (
          keys?: null | string | string[] | Record<string, unknown>,
          callback?: (result: Record<string, unknown>) => void
        ) => {
          const promise = mockWebExtension.storage.local.get(keys);
          if (callback) {
            promise.then((res) => callback(res));
          }
          return promise;
        },
        set: (
          items: Record<string, unknown>,
          callback?: () => void
        ) => {
          const promise = mockWebExtension.storage.local.set(items);
          if (callback) {
            promise.then(() => callback());
          }
          return promise;
        },
        remove: (
          keys: string | string[],
          callback?: () => void
        ) => {
          const promise = mockWebExtension.storage.local.remove(keys);
          if (callback) {
            promise.then(() => callback());
          }
          return promise;
        },
        clear: (callback?: () => void) => {
          const promise = mockWebExtension.storage.local.clear();
          if (callback) {
            promise.then(() => callback());
          }
          return promise;
        },
        onChanged: mockWebExtension.storage.local.onChanged,
      },
      sync: {
        get: (
          keys?: null | string | string[] | Record<string, unknown>,
          callback?: (result: Record<string, unknown>) => void
        ) => {
          const promise = mockWebExtension.storage.sync.get(keys);
          if (callback) {
            promise.then((res) => callback(res));
          }
          return promise;
        },
        set: (
          items: Record<string, unknown>,
          callback?: () => void
        ) => {
          const promise = mockWebExtension.storage.sync.set(items);
          if (callback) {
            promise.then(() => callback());
          }
          return promise;
        },
        remove: (
          keys: string | string[],
          callback?: () => void
        ) => {
          const promise = mockWebExtension.storage.sync.remove(keys);
          if (callback) {
            promise.then(() => callback());
          }
          return promise;
        },
        clear: (callback?: () => void) => {
          const promise = mockWebExtension.storage.sync.clear();
          if (callback) {
            promise.then(() => callback());
          }
          return promise;
        },
        onChanged: mockWebExtension.storage.sync.onChanged,
      },
      onChanged: mockWebExtension.storage.onChanged,
    };
  },
  get runtime() {
    return {
      id: mockWebExtension.runtime.id,
      get lastError() {
        return mockWebExtension.lastError;
      },
      set lastError(val: { message: string } | null) {
        mockWebExtension.lastError = val;
      },
      getURL: mockWebExtension.runtime.getURL,
      sendMessage: (
        message: unknown,
        callback?: (response: unknown) => void
      ) => {
        const promise = mockWebExtension.runtime.sendMessage(message);
        if (callback) {
          promise.then((resp) => {
            if (mockWebExtension.lastError) {
              callback(undefined);
            } else {
              callback(resp);
            }
          });
        }
        return promise;
      },
      onMessage: mockWebExtension.runtime.onMessage,
      onInstalled: mockWebExtension.runtime.onInstalled,
    };
  },
  get identity() {
    return mockWebExtension.identity;
  },
  get contextMenus() {
    return mockWebExtension.contextMenus;
  },
};

// Utilities for tests
export function resetWebExtensionMocks(): void {
  mockWebExtension.reset();
}

export function getMockStorage(area: StorageArea = 'local'): Record<string, unknown> {
  return area === 'local'
    ? mockWebExtension.localStorage._getData()
    : mockWebExtension.syncStorage._getData();
}

export function setMockStorage(data: Record<string, unknown>, area: StorageArea = 'local'): void {
  if (area === 'local') {
    mockWebExtension.localStorage._setData(data);
  } else {
    mockWebExtension.syncStorage._setData(data);
  }
}

export default fakeBrowser;
