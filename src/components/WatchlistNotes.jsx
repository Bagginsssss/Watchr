import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';

const WatchlistNotes = ({ symbol, name, onClose }) => {
  const { isDark } = useTheme();
  const { currency, convert, sym } = useCurrency();

  const [note, setNote] = useState('');
  const [tags, setTags] = useState([]);
  const [customTagInput, setCustomTagInput] = useState('');
  const [rating, setRating] = useState(null);
  const [targetPrice, setTargetPrice] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  const debounceTimerRef = useRef(null);
  const noteRef = useRef(note);
  const tagsRef = useRef(tags);
  const targetPriceRef = useRef(targetPrice);
  const ratingRef = useRef(rating);

  // Keep refs in sync with state
  noteRef.current = note;
  tagsRef.current = tags;
  targetPriceRef.current = targetPrice;
  ratingRef.current = rating;

  const predefinedTags = ['Dividend', 'Growth', 'Value', 'Momentum', 'Speculative', 'Core Holding', 'Watch Only'];

  // Load notes from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('watchlist_notes');
    if (stored) {
      try {
        const notes = JSON.parse(stored);
        if (notes[symbol]) {
          const { note: savedNote, tags: savedTags, targetPrice: savedTarget, rating: savedRating, updatedAt: savedTime } = notes[symbol];
          setNote(savedNote || '');
          setTags(savedTags || []);
          setTargetPrice(savedTarget || '');
          setRating(savedRating || null);
          setUpdatedAt(savedTime);
        }
      } catch (e) {
        console.error('Error loading watchlist notes:', e);
      }
    }
  }, [symbol]);

  // Clear debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Save notes to localStorage with debounce — reads from refs to avoid stale closures
  const saveNotes = () => {
    const stored = localStorage.getItem('watchlist_notes');
    let notes = {};
    if (stored) {
      try {
        notes = JSON.parse(stored);
      } catch (e) {
        console.error('Error parsing stored notes:', e);
      }
    }

    notes[symbol] = {
      note: noteRef.current,
      tags: tagsRef.current,
      targetPrice: targetPriceRef.current ? parseFloat(targetPriceRef.current) : null,
      rating: ratingRef.current,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem('watchlist_notes', JSON.stringify(notes));
    setUpdatedAt(new Date().toISOString());
    setHasChanges(false);
  };

  // Debounced save
  const handleChange = () => {
    setHasChanges(true);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(saveNotes, 500);
  };

  const toggleTag = (tag) => {
    setTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((t) => t !== tag);
      } else {
        return [...prev, tag];
      }
    });
    handleChange();
  };

  const addCustomTag = () => {
    if (customTagInput.trim() && !tags.includes(customTagInput.trim())) {
      setTags((prev) => [...prev, customTagInput.trim()]);
      setCustomTagInput('');
      handleChange();
    }
  };

  const removeTag = (tag) => {
    setTags((prev) => prev.filter((t) => t !== tag));
    handleChange();
  };

  const handleNoteChange = (e) => {
    setNote(e.target.value);
    handleChange();
  };

  const handleTargetPriceChange = (e) => {
    setTargetPrice(e.target.value);
    handleChange();
  };

  const handleRatingChange = (newRating) => {
    setRating(newRating === rating ? null : newRating);
    handleChange();
  };

  const formatUpdatedTime = (isoString) => {
    if (!isoString) return null;
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const styles = {
    overlay: {
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      zIndex: 999,
      animation: 'fadeIn 0.3s ease-out',
    },
    panel: {
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      maxWidth: '450px',
      backgroundColor: 'var(--bg)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 1000,
      animation: 'slideInRight 0.3s ease-out',
      '@media (max-width: 600px)': {
        maxWidth: '100%',
      },
    },
    header: {
      padding: '20px',
      borderBottom: `1px solid var(--border)`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    headerTitle: {
      margin: 0,
      fontSize: '18px',
      fontWeight: '600',
      color: 'var(--text)',
    },
    closeButton: {
      background: 'none',
      border: 'none',
      fontSize: '24px',
      cursor: 'pointer',
      color: 'var(--text-secondary)',
      padding: '0',
      width: '32px',
      height: '32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '4px',
      transition: 'background-color 0.2s',
    },
    content: {
      flex: 1,
      overflowY: 'auto',
      padding: '20px',
    },
    section: {
      marginBottom: '24px',
    },
    sectionLabel: {
      fontSize: '12px',
      fontWeight: '600',
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: '10px',
    },
    textarea: {
      width: '100%',
      minHeight: '120px',
      padding: '12px',
      border: `1px solid var(--border)`,
      borderRadius: '6px',
      backgroundColor: 'var(--bg-card)',
      color: 'var(--text)',
      fontFamily: 'inherit',
      fontSize: '14px',
      lineHeight: '1.5',
      resize: 'vertical',
      transition: 'border-color 0.2s',
    },
    tagContainer: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      marginBottom: '12px',
    },
    tagPill: {
      padding: '6px 12px',
      borderRadius: '16px',
      border: `1px solid var(--border)`,
      backgroundColor: 'var(--bg-card)',
      color: 'var(--text)',
      fontSize: '13px',
      cursor: 'pointer',
      transition: 'all 0.2s',
      userSelect: 'none',
    },
    tagPillActive: {
      backgroundColor: 'var(--bg-hover)',
      borderColor: 'var(--border-hover)',
      color: 'var(--text)',
    },
    customTagInputContainer: {
      display: 'flex',
      gap: '8px',
    },
    customTagInput: {
      flex: 1,
      padding: '8px 12px',
      border: `1px solid var(--border)`,
      borderRadius: '4px',
      backgroundColor: 'var(--bg-card)',
      color: 'var(--text)',
      fontSize: '14px',
      transition: 'border-color 0.2s',
    },
    customTagButton: {
      padding: '8px 16px',
      border: `1px solid var(--border)`,
      borderRadius: '4px',
      backgroundColor: 'var(--bg-card)',
      color: 'var(--text)',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: '500',
      transition: 'all 0.2s',
    },
    ratingContainer: {
      display: 'flex',
      gap: '12px',
    },
    ratingButton: {
      flex: 1,
      padding: '12px',
      border: `1px solid var(--border)`,
      borderRadius: '6px',
      backgroundColor: 'var(--bg-card)',
      color: 'var(--text)',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: '500',
      transition: 'all 0.2s',
    },
    ratingButtonBuy: {
      borderColor: 'var(--green)',
      backgroundColor: 'var(--green-bg)',
      color: 'var(--green)',
    },
    ratingButtonHold: {
      borderColor: 'var(--gold)',
      backgroundColor: 'var(--gold)',
      color: '#000',
    },
    ratingButtonSell: {
      borderColor: 'var(--red)',
      backgroundColor: 'var(--red-bg)',
      color: 'var(--red)',
    },
    priceInput: {
      width: '100%',
      padding: '10px 12px',
      border: `1px solid var(--border)`,
      borderRadius: '6px',
      backgroundColor: 'var(--bg-card)',
      color: 'var(--text)',
      fontSize: '14px',
      transition: 'border-color 0.2s',
    },
    updatedAtText: {
      fontSize: '12px',
      color: 'var(--text-muted)',
      marginTop: '12px',
    },
    tagList: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
    },
    tagChip: {
      padding: '4px 10px',
      backgroundColor: 'var(--bg-hover)',
      color: 'var(--text)',
      borderRadius: '12px',
      fontSize: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    },
    tagChipRemove: {
      cursor: 'pointer',
      fontWeight: 'bold',
      color: 'var(--text-secondary)',
    },
  };

  return (
    <>
      <div style={styles.overlay} onClick={onClose} />
      <div style={styles.panel}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.headerTitle}>{symbol}</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>{name}</p>
          </div>
          <button
            style={styles.closeButton}
            onClick={onClose}
            onMouseEnter={(e) => (e.target.style.backgroundColor = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.target.style.backgroundColor = 'transparent')}
          >
            ✕
          </button>
        </div>

        <div style={styles.content}>
          {/* Note Section */}
          <div style={styles.section}>
            <label style={styles.sectionLabel}>Investment Thesis</label>
            <textarea
              style={styles.textarea}
              value={note}
              onChange={handleNoteChange}
              placeholder="Add your investment thesis, waiting for events, price targets, etc."
            />
          </div>

          {/* Tags Section */}
          <div style={styles.section}>
            <label style={styles.sectionLabel}>Tags</label>
            <div style={styles.tagContainer}>
              {predefinedTags.map((tag) => (
                <button
                  key={tag}
                  style={{
                    ...styles.tagPill,
                    ...(tags.includes(tag) ? styles.tagPillActive : {}),
                  }}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* Custom Tag Input */}
            <div style={styles.customTagInputContainer}>
              <input
                style={styles.customTagInput}
                type="text"
                value={customTagInput}
                onChange={(e) => setCustomTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
                placeholder="Add custom tag"
              />
              <button
                style={styles.customTagButton}
                onClick={addCustomTag}
                onMouseEnter={(e) => (e.target.style.backgroundColor = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.target.style.backgroundColor = 'var(--bg-card)')}
              >
                Add
              </button>
            </div>

            {/* Display custom tags */}
            {tags.length > 0 && (
              <div style={{ ...styles.tagList, marginTop: '12px' }}>
                {tags.map((tag) => (
                  <div key={tag} style={styles.tagChip}>
                    {tag}
                    <span
                      style={styles.tagChipRemove}
                      onClick={() => removeTag(tag)}
                    >
                      ✕
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Personal Rating Section */}
          <div style={styles.section}>
            <label style={styles.sectionLabel}>Personal Rating</label>
            <div style={styles.ratingContainer}>
              <button
                style={{
                  ...styles.ratingButton,
                  ...(rating === 'buy' ? styles.ratingButtonBuy : {}),
                }}
                onClick={() => handleRatingChange('buy')}
              >
                Buy
              </button>
              <button
                style={{
                  ...styles.ratingButton,
                  ...(rating === 'hold' ? styles.ratingButtonHold : {}),
                }}
                onClick={() => handleRatingChange('hold')}
              >
                Hold
              </button>
              <button
                style={{
                  ...styles.ratingButton,
                  ...(rating === 'sell' ? styles.ratingButtonSell : {}),
                }}
                onClick={() => handleRatingChange('sell')}
              >
                Sell
              </button>
            </div>
          </div>

          {/* Target Price Section */}
          <div style={styles.section}>
            <label style={styles.sectionLabel}>Target Price ({sym})</label>
            <input
              style={styles.priceInput}
              type="number"
              step="0.01"
              value={targetPrice}
              onChange={handleTargetPriceChange}
              placeholder={`Enter target price in ${currency}`}
            />
          </div>

          {/* Last Updated */}
          {updatedAt && (
            <div style={styles.updatedAtText}>
              Last updated: {formatUpdatedTime(updatedAt)}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }

        @media (max-width: 600px) {
          textarea, input[type="text"], input[type="number"] {
            font-size: 16px !important;
          }
        }
      `}</style>
    </>
  );
};

export default WatchlistNotes;
