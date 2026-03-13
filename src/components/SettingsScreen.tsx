// src/components/SettingsScreen.tsx
import { useState, useEffect } from 'react';
import type { AppState } from '../App';
import { TubeSyncLogo } from './Logo';

interface NotionDB { id: string; title: string }

interface Props {
  workspaceName: string;
  databaseId: string;
  databaseName: string;
  autoArchive: boolean;
  playerIntegration: boolean;
  onBack: () => void;
  onDisconnect: () => void;
  onDatabaseChange: (id: string, name: string) => void;
  onSettingsChange: (changes: Partial<AppState>) => void;
}

function sendMsg<T = any>(msg: any): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(res);
    });
  });
}

export default function SettingsScreen({
  workspaceName, databaseId, databaseName, autoArchive, playerIntegration,
  onBack, onDisconnect, onDatabaseChange, onSettingsChange
}: Props) {
  const [databases, setDatabases] = useState<NotionDB[]>([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [selectedDb, setSelectedDb] = useState(databaseId);
  const [disconnecting, setDisconnecting] = useState(false);
  const [autoArchiveLocal, setAutoArchiveLocal] = useState(autoArchive);
  const [playerLocal, setPlayerLocal] = useState(playerIntegration);
  const [email, setEmail] = useState('');

  useEffect(() => {
    // Load email from storage
    chrome.storage.local.get('workspace_name', (r) => {
      if (r.workspace_name) setEmail(r.workspace_name as string);
    });
  }, []);

  const loadDatabases = async () => {
    setDbLoading(true);
    try {
      const res = await sendMsg<any>({ type: 'GET_DATABASES' });
      if (res.success) {
        setDatabases((res.databases ?? []).map((d: any) => ({
          id: d.id,
          title: d.title?.[0]?.plain_text ?? 'Untitled',
        })));
      }
    } finally {
      setDbLoading(false);
    }
  };

  useEffect(() => { loadDatabases(); }, []);

  const handleDbChange = async (id: string) => {
    setSelectedDb(id);
    const db = databases.find((d) => d.id === id);
    await sendMsg({ type: 'SET_DATABASE', databaseId: id, databaseName: db?.title ?? '' });
    onDatabaseChange(id, db?.title ?? '');
  };

  const handleToggle = async (key: 'autoArchive' | 'playerIntegration') => {
    let nextAuto = autoArchiveLocal;
    let nextPlayer = playerLocal;
    if (key === 'autoArchive') { nextAuto = !autoArchiveLocal; setAutoArchiveLocal(nextAuto); }
    else { nextPlayer = !playerLocal; setPlayerLocal(nextPlayer); }
    await sendMsg({ type: 'UPDATE_SETTINGS', auto_archive: nextAuto, player_integration: nextPlayer });
    onSettingsChange({ autoArchive: nextAuto, playerIntegration: nextPlayer });
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect your Notion account? This will clear all settings.')) return;
    setDisconnecting(true);
    await onDisconnect();
  };

  const Toggle = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => (
    <div
      onClick={onToggle}
      style={{ width: 44, height: 24, background: on ? '#2373df' : '#e2e8f0', borderRadius: 999, position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s' }}>
      <div style={{ position: 'absolute', top: 2, left: on ? 'calc(100% - 22px)' : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }}></div>
    </div>
  );

  return (
    <div style={{ width: 380, minHeight: 600, display: 'flex', flexDirection: 'column', background: '#fff', fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 20, padding: 2, lineHeight: 1, display: 'flex' }}>←</button>
        <TubeSyncLogo size={28} />
        <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', flex: 1 }}>Settings</span>
        <button onClick={() => chrome.runtime.sendMessage({ type: 'OPEN_POPOUT' })} title="Pop out" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, padding: 2 }}>⧉</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto' }}>

        {/* Notion Connection */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#475569', textTransform: 'uppercase', marginBottom: 12 }}>Notion Connection</div>
          <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>📄</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{workspaceName || 'Notion Workspace'}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{email}</div>
              </div>
              <button
                onClick={async () => {
                  // Re-auth
                  await sendMsg({ type: 'NOTION_AUTH' });
                  window.location.reload();
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: 12, fontWeight: 700, padding: 0, flexShrink: 0 }}>Change</button>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              style={{ width: '100%', background: '#fff', border: '1px solid #fecaca', borderRadius: 10, color: '#ef4444', fontSize: 13, fontWeight: 600, padding: '10px', cursor: disconnecting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {disconnecting ? 'Disconnecting...' : 'Disconnect Account'}
            </button>
          </div>
        </div>

        {/* Database Settings */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#475569', textTransform: 'uppercase', marginBottom: 12 }}>Database Settings</div>
          <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>Target Database</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <select
                  value={selectedDb}
                  onChange={(e) => handleDbChange(e.target.value)}
                  disabled={dbLoading}
                  style={{ width: '100%', appearance: 'none', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 32px 10px 12px', fontSize: 13, fontWeight: 500, color: '#1e293b', outline: 'none', cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box' }}>
                  {dbLoading && <option value="">Loading...</option>}
                  {databases.map((db) => (
                    <option key={db.id} value={db.id}>{db.title}</option>
                  ))}
                </select>
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}>▾</span>
              </div>
              <button
                onClick={loadDatabases}
                disabled={dbLoading}
                title="Refresh database list"
                style={{ width: 42, height: 42, background: '#e2e8f0', border: '1px solid #e2e8f0', borderRadius: 10, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {dbLoading ? '⏳' : '↻'}
              </button>
            </div>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '8px 0 0' }}>
              Currently syncing: <strong style={{ color: '#475569' }}>{databaseName || 'Not set'}</strong>
            </p>
          </div>
        </div>

        {/* Automation */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#475569', textTransform: 'uppercase', marginBottom: 12 }}>Automation</div>
          <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 3 }}>Auto-archive watched</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Move to archive after 100% completion</div>
              </div>
              <Toggle on={autoArchiveLocal} onToggle={() => handleToggle('autoArchive')} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 3 }}>Player Integration</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Show buttons on YouTube player</div>
              </div>
              <Toggle on={playerLocal} onToggle={() => handleToggle('playerIntegration')} />
            </div>
          </div>
        </div>

        {/* Buy me a coffee */}
        <button
          onClick={() => chrome.tabs.create({ url: 'https://ko-fi.com/zatzk' })}
          style={{ width: '100%', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 14, color: '#b45309', fontSize: 13, fontWeight: 700, padding: '13px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          ☕ Buy me a coffee
        </button>
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 16px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>v1.0.0</span>
        <div style={{ display: 'flex', gap: 16 }}>
          <a onClick={() => chrome.tabs.create({ url: 'https://github.com' })} style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}>Help</a>
          <a onClick={() => chrome.tabs.create({ url: 'https://github.com' })} style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}>Privacy</a>
        </div>
      </div>
    </div>
  );
}
