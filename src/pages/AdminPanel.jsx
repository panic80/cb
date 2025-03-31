import React, { useState, useEffect, useCallback } from 'react';

function AdminPanel() {
  const [sourceUrl, setSourceUrl] = useState('');
  const [vectorCount, setVectorCount] = useState(null);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState({
    stats: false,
    addSource: false,
    resetDb: false,
  });
  const [feedback, setFeedback] = useState({
    type: null, // 'success' or 'error'
    message: '',
  });

  const showFeedback = (type, message) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback({ type: null, message: '' }), 5000); // Clear after 5 seconds
  };

  const fetchStats = useCallback(async () => {
    setLoading((prev) => ({ ...prev, stats: true }));
    try {
      const [sizeRes, sourcesRes] = await Promise.all([
        fetch('/api/admin/vector-size'),
        fetch('/api/admin/sources'),
      ]);

      if (!sizeRes.ok || !sourcesRes.ok) {
        throw new Error('Failed to fetch admin stats');
      }

      const sizeData = await sizeRes.json();
      const sourcesData = await sourcesRes.json();

      if (sizeData.success) {
        setVectorCount(sizeData.count);
      } else {
        throw new Error(sizeData.message || 'Failed to get vector size');
      }

      if (sourcesData.success) {
        setSources(sourcesData.sources);
      } else {
        throw new Error(sourcesData.message || 'Failed to get sources');
      }
      // Clear feedback on successful refresh
      if (feedback.type) {
          setFeedback({ type: null, message: '' });
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
      showFeedback('error', `Error fetching stats: ${error.message}`);
      setVectorCount(null); // Reset on error
      setSources([]); // Reset on error
    } finally {
      setLoading((prev) => ({ ...prev, stats: false }));
    }
  }, [feedback.type]); // Re-create fetchStats if feedback type changes (to allow clearing feedback)


  useEffect(() => {
    fetchStats();
  }, [fetchStats]); // Fetch stats on initial mount and when fetchStats changes


  const handleAddSource = async (e) => {
    e.preventDefault();
    if (!sourceUrl.trim()) {
      showFeedback('error', 'Please enter a URL.');
      return;
    }
    setLoading((prev) => ({ ...prev, addSource: true }));
    try {
      const response = await fetch('/api/admin/add-source', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: sourceUrl }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to add source');
      }
      showFeedback('success', `Source added successfully: ${sourceUrl}`);
      setSourceUrl(''); // Clear input on success
      fetchStats(); // Refresh stats
    } catch (error) {
      console.error('Error adding source:', error);
      showFeedback('error', `Error adding source: ${error.message}`);
    } finally {
      setLoading((prev) => ({ ...prev, addSource: false }));
    }
  };

  const handleResetDb = async () => {
    if (window.confirm('Are you sure you want to reset the database? This action cannot be undone.')) {
      setLoading((prev) => ({ ...prev, resetDb: true }));
      try {
        const response = await fetch('/api/admin/reset-db', {
          method: 'POST',
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.message || 'Failed to reset database');
        }
        showFeedback('success', 'Database reset successfully.');
        fetchStats(); // Refresh stats after reset
      } catch (error) {
        console.error('Error resetting database:', error);
        showFeedback('error', `Error resetting database: ${error.message}`);
      } finally {
        setLoading((prev) => ({ ...prev, resetDb: false }));
      }
    }
  };

  // Basic inline styles for demonstration
  const styles = {
    container: { padding: '20px', fontFamily: 'sans-serif', maxWidth: '600px', margin: 'auto' },
    section: { marginBottom: '20px', padding: '15px', border: '1px solid #ccc', borderRadius: '5px' },
    heading: { marginTop: 0, marginBottom: '10px', borderBottom: '1px solid #eee', paddingBottom: '5px' },
    input: { padding: '8px', marginRight: '10px', minWidth: '300px' },
    button: { padding: '8px 15px', cursor: 'pointer', marginRight: '10px' },
    list: { listStyle: 'none', padding: 0 },
    listItem: { marginBottom: '5px', wordBreak: 'break-all' },
    feedback: {
      padding: '10px',
      marginTop: '10px',
      borderRadius: '4px',
      border: '1px solid',
    },
    success: { borderColor: 'green', backgroundColor: '#e6ffe6', color: 'darkgreen' },
    error: { borderColor: 'red', backgroundColor: '#ffe6e6', color: 'darkred' },
    disabledButton: { cursor: 'not-allowed', opacity: 0.6 }
  };

  return (
    <div style={styles.container}>
      <h1>FAISS Admin Control Panel</h1>

      {feedback.message && (
        <div style={{ ...styles.feedback, ...(feedback.type === 'success' ? styles.success : styles.error) }}>
          {feedback.message}
        </div>
      )}

      <section style={styles.section}>
        <h2 style={styles.heading}>Add New Source</h2>
        <form onSubmit={handleAddSource}>
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="Enter URL to add as source"
            style={styles.input}
            required
            disabled={loading.addSource}
          />
          <button type="submit" style={loading.addSource ? {...styles.button, ...styles.disabledButton} : styles.button} disabled={loading.addSource}>
            {loading.addSource ? 'Adding...' : 'Add Source'}
          </button>
        </form>
      </section>

      <section style={styles.section}>
        <h2 style={styles.heading}>Database Stats</h2>
        <button onClick={fetchStats} style={loading.stats ? {...styles.button, ...styles.disabledButton} : styles.button} disabled={loading.stats}>
          {loading.stats ? 'Refreshing...' : 'Refresh Stats'}
        </button>
        <p>
          <strong>Vector Count:</strong> {loading.stats ? 'Loading...' : (vectorCount !== null ? vectorCount : 'N/A')}
        </p>
        <div>
          <strong>Sources:</strong> {loading.stats ? 'Loading...' : (sources.length > 0 ? `(${sources.length})` : '(0)')}
          { !loading.stats && sources.length > 0 && (
              <ul style={styles.list}>
                {sources.map((src, index) => (
                  <li key={index} style={styles.listItem}>{src.url}</li>
                ))}
              </ul>
            )
          }
           { !loading.stats && sources.length === 0 && (<p>No sources found.</p>) }
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.heading}>Database Management</h2>
        <button onClick={handleResetDb} style={loading.resetDb ? {...styles.button, ...styles.disabledButton, backgroundColor: '#f44336', color: 'white'} : {...styles.button, backgroundColor: '#f44336', color: 'white'}} disabled={loading.resetDb}>
          {loading.resetDb ? 'Resetting...' : 'Reset Database'}
        </button>
        <p style={{fontSize: '0.9em', color: '#666'}}>Warning: Resetting the database will remove all indexed data.</p>
      </section>
    </div>
  );
}

export default AdminPanel;