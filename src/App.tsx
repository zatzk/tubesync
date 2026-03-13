// src/App.tsx
// Central state manager – loads storage on mount, decides which screen to show.
import { useState, useEffect } from 'react';
import browser from 'webextension-polyfill';
import OnboardingScreen from './components/OnboardingScreen';
import DashboardScreen from './components/DashboardScreen';
import SettingsScreen from './components/SettingsScreen';
import { TubeSyncLogo } from './components/Logo';

export type AppScreen = 'onboarding' | 'dashboard' | 'settings';

export interface AppState {
  token: string | null;
  workspaceName: string;
  databaseId: string | null;
  databaseName: string;
  autoArchive: boolean;
  playerIntegration: boolean;
}

const DEFAULT_STATE: AppState = {
  token: null,
  workspaceName: '',
  databaseId: null,
  databaseName: '',
  autoArchive: true,
  playerIntegration: true,
};

async function sendMsg<T = any>(msg: any): Promise<T> {
  return browser.runtime.sendMessage(msg);
}

function App() {
  const [screen, setScreen] = useState<AppScreen>('onboarding');
  const [app, setApp] = useState<AppState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);

  // Load persisted state on mount
  useEffect(() => {
    (async () => {
      const r = await browser.storage.local.get(
        ['notion_token', 'workspace_name', 'notion_database_id', 'notion_database_name', 'auto_archive', 'player_integration']
      );
      const token = (r.notion_token as string) ?? null;
      const dbId = (r.notion_database_id as string) ?? null;
      setApp({
        token,
        workspaceName: (r.workspace_name as string) ?? '',
        databaseId: dbId,
        databaseName: (r.notion_database_name as string) ?? '',
        autoArchive: (r.auto_archive as boolean) ?? true,
        playerIntegration: (r.player_integration as boolean) ?? true,
      });
      setScreen(token && dbId ? 'dashboard' : 'onboarding');
      setLoading(false);
    })();
  }, []);

  const handleAuthSuccess = (workspace: string, token: string) => {
    setApp((prev) => ({ ...prev, token, workspaceName: workspace }));
    // Stay on onboarding for DB selection step
  };

  const handleDbSelected = (id: string, name: string) => {
    setApp((prev) => ({ ...prev, databaseId: id, databaseName: name }));
    setScreen('dashboard');
  };

  const handleDisconnect = async () => {
    await sendMsg({ type: 'DISCONNECT' });
    setApp(DEFAULT_STATE);
    setScreen('onboarding');
  };

  const handleDbChange = (id: string, name: string) => {
    setApp((prev) => ({ ...prev, databaseId: id, databaseName: name }));
  };

  const handleSettingsUpdate = (changes: Partial<AppState>) => {
    setApp((prev) => ({ ...prev, ...changes }));
  };

  if (loading) {
    return (
      <div style={{ width: 380, height: 580, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <TubeSyncLogo size={36} />
          </div>
          <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {screen === 'onboarding' && (
        <OnboardingScreen
          token={app.token}
          workspaceName={app.workspaceName}
          onAuthSuccess={handleAuthSuccess}
          onDatabaseSelected={handleDbSelected}
        />
      )}
      {screen === 'dashboard' && (
        <DashboardScreen
          databaseId={app.databaseId!}
          workspaceName={app.workspaceName}
          onSettings={() => setScreen('settings')}
        />
      )}
      {screen === 'settings' && (
        <SettingsScreen
          workspaceName={app.workspaceName}
          databaseId={app.databaseId!}
          databaseName={app.databaseName}
          autoArchive={app.autoArchive}
          playerIntegration={app.playerIntegration}
          onBack={() => setScreen('dashboard')}
          onDisconnect={handleDisconnect}
          onDatabaseChange={handleDbChange}
          onSettingsChange={handleSettingsUpdate}
        />
      )}
    </>
  );
}

export default App;
