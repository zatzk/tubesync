// src/components/OnboardingScreen.tsx
import { useState, useEffect } from 'react';

interface NotionDB { id: string; title: string }

interface Props {
  token: string | null;
  workspaceName: string;
  onAuthSuccess: (workspace: string, token: string) => void;
  onDatabaseSelected: (id: string, name: string) => void;
}

function sendMsg<T = any>(msg: any): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(res);
    });
  });
}

export default function OnboardingScreen({ token, workspaceName, onAuthSuccess, onDatabaseSelected }: Props) {
  const [step2Unlocked, setStep2Unlocked] = useState(!!token);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [databases, setDatabases] = useState<NotionDB[]>([]);
  const [selectedDbId, setSelectedDbId] = useState('');
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState('');
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Load databases once step 2 is unlocked
  useEffect(() => {
    if (!step2Unlocked) return;
    setDbLoading(true);
    sendMsg<any>({ type: 'GET_DATABASES' })
      .then((res) => {
        if (res.success) {
          const dbs: NotionDB[] = (res.databases ?? []).map((d: any) => ({
            id: d.id,
            title: d.title?.[0]?.plain_text ?? 'Untitled',
          }));
          setDatabases(dbs);
        }
      })
      .finally(() => setDbLoading(false));
  }, [step2Unlocked]);

  const handleConnect = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await sendMsg<any>({ type: 'NOTION_AUTH' });
      if (res.success) {
        // Read token from storage immediately
        chrome.storage.local.get('notion_token', (r) => {
          onAuthSuccess(res.workspace ?? 'Workspace', r.notion_token as string);
          setStep2Unlocked(true);
        });
      } else {
        setAuthError(res.error ?? 'Authentication failed');
      }
    } catch (e: any) {
      setAuthError(e.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    setCreating(true);
    setDbError('');
    try {
      const res = await sendMsg<any>({ type: 'CREATE_TEMPLATE_DB' });
      if (res.success) {
        onDatabaseSelected(res.databaseId, res.databaseName ?? 'TubeSync Watch Later');
      } else {
        setDbError(res.error ?? 'Failed to create database. Make sure you have shared a Notion page with TubeSync.');
      }
    } catch (e: any) {
      setDbError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleStartSyncing = async () => {
    if (!selectedDbId) { setDbError('Please select a database first'); return; }
    setSyncing(true);
    try {
      const selected = databases.find((d) => d.id === selectedDbId);
      await sendMsg({ type: 'SET_DATABASE', databaseId: selectedDbId, databaseName: selected?.title ?? '' });
      onDatabaseSelected(selectedDbId, selected?.title ?? '');
    } catch (e: any) {
      setDbError(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const connectedStyle: React.CSSProperties = {
    opacity: step2Unlocked ? 1 : 0.4,
    pointerEvents: step2Unlocked ? 'auto' : 'none',
  };

  return (
    <div style={{ width: 380, minHeight: 580, display: 'flex', flexDirection: 'column', background: '#fff', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#2373df', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13 }}>TS</div>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>TubeSync</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => chrome.runtime.sendMessage({ type: 'OPEN_POPOUT' })}
            title="Pop out"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, padding: 2 }}>⧉</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 28, overflowY: 'auto' }}>

        {/* Step 1 */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#2373df', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>1</div>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#475569', textTransform: 'uppercase' }}>Connect Workspace</span>
          </div>
          {step2Unlocked ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12 }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#16a34a' }}>Connected to {workspaceName || 'Notion'}</span>
            </div>
          ) : (
            <>
              <button
                onClick={handleConnect}
                disabled={authLoading}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '12px 16px', background: authLoading ? '#f8fafc' : '#fff', border: '1px solid #e2e8f0', borderRadius: 12, cursor: authLoading ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600, color: '#1e293b', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ width: 18, height: 18, background: '#000', borderRadius: 4, color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>N</div>
                {authLoading ? 'Connecting...' : 'Connect to Notion'}
              </button>
              {authError && <p style={{ fontSize: 11, color: '#ef4444', margin: '8px 0 0', paddingLeft: 4 }}>{authError}</p>}
            </>
          )}
        </div>

        {/* Step 2 */}
        <div style={connectedStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: step2Unlocked ? '#2373df' : '#f1f5f9', color: step2Unlocked ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>2</div>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: step2Unlocked ? '#475569' : '#94a3b8', textTransform: 'uppercase' }}>Select Database</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={handleCreateTemplate}
              disabled={creating}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, cursor: creating ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600, color: '#3b82f6' }}>
              {creating ? '⏳ Creating...' : '✦ Create Template Database'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: '#f1f5f9' }}></div>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#cbd5e1' }}>OR</span>
              <div style={{ flex: 1, height: 1, background: '#f1f5f9' }}></div>
            </div>

            <div style={{ position: 'relative' }}>
              <select
                value={selectedDbId}
                onChange={(e) => setSelectedDbId(e.target.value)}
                disabled={dbLoading}
                style={{ width: '100%', appearance: 'none', padding: '12px 32px 12px 14px', background: '#fafafa', border: '1px solid #f1f5f9', borderRadius: 12, fontSize: 14, color: selectedDbId ? '#1e293b' : '#94a3b8', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                <option value="">{dbLoading ? 'Loading databases...' : 'Choose existing database...'}</option>
                {databases.map((db) => (
                  <option key={db.id} value={db.id}>{db.title}</option>
                ))}
              </select>
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}>▾</span>
            </div>
            {dbError && <p style={{ fontSize: 11, color: '#ef4444', margin: 0, paddingLeft: 4 }}>{dbError}</p>}
          </div>
        </div>

        {/* Preferences */}
        <div>
          <div style={{ background: '#f8fafc', borderRadius: 14, border: '1px solid #f1f5f9', padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#94a3b8', textTransform: 'uppercase' }}>Preferences</span>
              <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 500 }}>Edit after setup</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {['Auto-archive watched', 'Add overlay buttons'].map((label) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>{label}</span>
                  <div style={{ width: 36, height: 20, borderRadius: 999, background: '#bfdbfe', position: 'relative' }}>
                    <div style={{ position: 'absolute', right: 2, top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', background: '#fff' }}>
        <button
          onClick={handleStartSyncing}
          disabled={!step2Unlocked || syncing}
          style={{ width: '100%', padding: '13px', background: step2Unlocked ? '#2373df' : '#e2e8f0', borderRadius: 12, border: 'none', cursor: step2Unlocked ? 'pointer' : 'not-allowed', fontSize: 15, fontWeight: 700, color: step2Unlocked ? '#fff' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
          {syncing ? 'Starting...' : 'Start Syncing 🚀'}
        </button>
        <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 12, marginBottom: 0 }}>
          {step2Unlocked ? 'Select or create a database above to continue.' : 'Connect Notion to begin managing your YouTube library.'}
        </p>
      </div>
    </div>
  );
}
