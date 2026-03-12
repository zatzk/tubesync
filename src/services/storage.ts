// src/services/storage.ts
// Typed wrapper around chrome.storage.local

export interface AppStorage {
  notion_token?: string;
  workspace_name?: string;
  workspace_icon?: string;
  notion_database_id?: string;
  notion_database_name?: string;
  auto_archive?: boolean;
  player_integration?: boolean;
}

export async function getStorage<K extends keyof AppStorage>(keys: K[]): Promise<Pick<AppStorage, K>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys as string[], (result) => {
      resolve(result as Pick<AppStorage, K>);
    });
  });
}

export async function setStorage(data: Partial<AppStorage>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve);
  });
}

export async function clearStorage(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.clear(resolve);
  });
}

export function sendMessage<T = any>(message: any): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}
