// src/components/DashboardScreen.tsx
import { useState, useEffect, useCallback } from 'react';
import { TubeSyncLogo } from './Logo';

interface Video {
  id: string;
  title: string;
  url: string;
  channel: string;
  status: string;
  reference: boolean;
  thumbnail?: string;
  duration?: string;
}

interface Props {
  databaseId: string;
  workspaceName: string;
  onSettings: () => void;
}

function sendMsg<T = any>(msg: any): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(res);
    });
  });
}

export default function DashboardScreen({ workspaceName, onSettings }: Props) {
  const [activeTab, setActiveTab] = useState<'To Watch' | 'Reference'>('To Watch');
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState(false);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sendMsg<any>({ type: 'GET_VIDEOS', tab: activeTab });
      if (res.success) setVideos(res.videos ?? []);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  // Real-time refresh: listen for VIDEO_SAVED broadcasts from background
  useEffect(() => {
    const handler = (msg: any) => {
      if (msg.type === 'VIDEO_SAVED') fetchVideos();
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [fetchVideos]);

  // Also refresh when popup becomes visible again (user switches tabs)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') fetchVideos(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchVideos]);

  const handlePopOut = () => chrome.runtime.sendMessage({ type: 'OPEN_POPOUT' });

  const handleSaveUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setSaving(true);
    setSaveError('');
    setSaveOk(false);
    try {
      const res = await sendMsg<any>({ type: 'SAVE_VIDEO', url });
      if (res.success) {
        setUrlInput('');
        setSaveOk(true);
        setTimeout(() => setSaveOk(false), 2000);
        fetchVideos();
      } else {
        setSaveError(res.error ?? 'Failed to save');
      }
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleReference = async (v: Video, e: React.MouseEvent) => {
    e.stopPropagation();
    const newVal = !v.reference;
    // Optimistic update
    setVideos((prev) => prev.map((x) => x.id === v.id ? { ...x, reference: newVal } : x));
    try {
      await sendMsg({ type: 'TOGGLE_REFERENCE', pageId: v.id, value: newVal });
    } catch {
      // Revert on error
      setVideos((prev) => prev.map((x) => x.id === v.id ? { ...x, reference: v.reference } : x));
    }
  };

  const filteredVideos = videos.filter((v) =>
    !search || v.title.toLowerCase().includes(search.toLowerCase()) || v.channel.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ width: 380, height: 600, display: 'flex', flexDirection: 'column', background: '#fff', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <TubeSyncLogo size={28} />
          <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>TubeSync</span>
        </div>

        {/* Search */}
        <div style={{ flex: 1, position: 'relative', marginLeft: 6 }}>
          <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 12 }}>🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            style={{ width: '100%', background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '6px 8px 6px 26px', fontSize: 12, color: '#475569', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>

        <button onClick={handlePopOut} title="Pop out window" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, padding: '2px 3px', flexShrink: 0 }}>⧉</button>
        <button onClick={onSettings} title="Settings" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, padding: '2px 3px', flexShrink: 0 }}>⚙</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9' }}>
        {(['To Watch', 'Reference'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{ flex: 1, padding: '11px', fontSize: 13, fontWeight: activeTab === tab ? 600 : 500, color: activeTab === tab ? '#2373df' : '#94a3b8', background: 'none', border: 'none', borderBottom: activeTab === tab ? '2px solid #2373df' : '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.15s' }}>
            {tab}
          </button>
        ))}
      </div>

      {/* Video List */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 4 }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Loading videos...</div>
        )}
        {!loading && filteredVideos.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>
            {search ? 'No results found.' : `No videos in "${activeTab}" yet.`}
          </div>
        )}
        {!loading && filteredVideos.map((v) => (
          <div
            key={v.id}
            onClick={() => v.url && chrome.tabs.create({ url: v.url })}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', transition: 'background 0.1s' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
            {/* Thumbnail */}
            <div style={{ position: 'relative', width: 112, height: 63, borderRadius: 8, overflow: 'hidden', background: 'linear-gradient(135deg, #1e293b, #334155)', flexShrink: 0 }}>
              {v.thumbnail
                ? <img src={v.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 24 }}>▶</div>
              }
            </div>
            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', lineHeight: 1.3, marginBottom: 3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{v.title}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{v.channel}</div>
              {v.status === 'Watched' && <div style={{ fontSize: 11, color: '#22c55e', marginTop: 2 }}>✓ Watched</div>}
            </div>
            {/* Heart (Reference toggle) */}
            <button
              onClick={(e) => handleToggleReference(v, e)}
              title={v.reference ? 'Remove from Reference' : 'Add to Reference'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: v.reference ? '#2373df' : '#cbd5e1', fontSize: 18, padding: 4, flexShrink: 0, transition: 'color 0.15s' }}>
              {v.reference ? '♥' : '♡'}
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 14 }}>🔗</span>
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveUrl()}
              placeholder="Paste video URL..."
              style={{ width: '100%', border: `1px solid ${saveError ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 10, padding: '9px 10px 9px 30px', fontSize: 13, color: '#475569', outline: 'none', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' }}
            />
          </div>
          <button
            onClick={handleSaveUrl}
            disabled={saving || !urlInput.trim()}
            style={{ background: saving || !urlInput.trim() ? '#94a3b8' : (saveOk ? '#22c55e' : '#2373df'), color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: saving || !urlInput.trim() ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', transition: 'background 0.2s' }}>
            {saving ? '...' : saveOk ? '✓ Saved' : '+ Save'}
          </button>
        </div>
        {saveError && <p style={{ fontSize: 11, color: '#ef4444', margin: '6px 0 0' }}>{saveError}</p>}
        <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', margin: '8px 0 0', fontWeight: 500 }}>
          Connected to <strong style={{ color: '#64748b', fontWeight: 600 }}>{workspaceName || 'Notion'}</strong>
        </p>
      </div>
    </div>
  );
}
