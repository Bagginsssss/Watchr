import { useState, useRef, useCallback, useEffect } from 'react'
import { callClaudeVision } from '../api/research.js'
import { searchSymbol } from '../api/yahoo.js'

const MAX_SIZE = 10 * 1024 * 1024 // 10MB

const EXTRACT_PROMPT = `Analyze this screenshot of a brokerage/investment portfolio. Extract every stock or ETF holding visible.

For each holding, extract:
- symbol: The stock ticker (e.g., "AAPL", "RY", "VFV", "SHOP")
- name: The company or ETF name
- shares: Number of shares/units held (use 0 if not visible)
- avg_cost: Average cost per share (use 0 if not visible)

Return ONLY a valid JSON array, no other text. Example:
[{"symbol":"AAPL","name":"Apple Inc.","shares":50,"avg_cost":145.50},{"symbol":"RY","name":"Royal Bank of Canada","shares":100,"avg_cost":130.00}]

If you cannot identify any holdings, return: []
Important: Use the ticker symbol as displayed. For Canadian stocks, do NOT add .TO suffix — just use the base ticker (e.g., "RY" not "RY.TO").`

/**
 * Reads a File as base64 data URL.
 * Returns { base64, mediaType }
 */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      const [header, base64] = dataUrl.split(',')
      const mediaType = header.match(/data:(.*?);/)?.[1] || 'image/png'
      resolve({ base64, mediaType })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function StatusBadge({ status }) {
  const styles = {
    validating: { bg: '#F59E0B22', color: '#F59E0B', text: '...' },
    valid:      { bg: '#0A7C5C22', color: '#0A7C5C', text: '✓' },
    invalid:    { bg: '#EF444422', color: '#EF4444', text: '✕' },
  }
  const s = styles[status] || styles.validating
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 22, height: 22, borderRadius: '50%',
      background: s.bg, color: s.color, fontSize: 12, fontWeight: 700,
    }}>{s.text}</span>
  )
}

export default function PortfolioImportModal({ onClose, onImport }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState(null) // [{ symbol, name, shares, avg_cost, status, validatedSymbol }]
  const [importing, setImporting] = useState(false)
  const fileRef = useRef(null)
  const dropRef = useRef(null)
  const previewRef = useRef(null)
  previewRef.current = preview

  // Revoke blob URL on unmount
  useEffect(() => {
    return () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current) }
  }, [])

  const handleFile = useCallback((f) => {
    if (!f) return
    if (f.size > MAX_SIZE) { setError('Image must be under 10MB'); return }
    if (!f.type.startsWith('image/')) { setError('Please upload an image file'); return }
    setFile(f)
    // Revoke old blob URL before creating a new one
    setPreview(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(f)
    })
    setError('')
    setResults(null)
  }, [])

  function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    dropRef.current?.classList.remove('drag-over')
    const f = e.dataTransfer?.files?.[0]
    if (f) handleFile(f)
  }

  async function analyze() {
    if (!file) return
    setAnalyzing(true)
    setError('')
    setResults(null)

    try {
      const { base64, mediaType } = await readFileAsBase64(file)
      const response = await callClaudeVision(EXTRACT_PROMPT, base64, mediaType)

      // Parse JSON from response (Claude might wrap it in markdown code blocks)
      let parsed
      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Could not parse holdings from image')
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        setError('No holdings found. Please use a clearer screenshot showing your stock symbols, share counts, and cost basis.')
        setAnalyzing(false)
        return
      }

      // Initialize results with validating status
      const items = parsed.map(h => ({
        symbol: (h.symbol || '').toUpperCase().trim(),
        name: h.name || '',
        shares: parseFloat(h.shares) || 0,
        avg_cost: parseFloat(h.avg_cost) || 0,
        status: 'validating',
        validatedSymbol: null,
        include: true,
      }))
      setResults(items)

      // Validate each symbol against Yahoo Finance
      for (let i = 0; i < items.length; i++) {
        try {
          const matches = await searchSymbol(items[i].symbol)
          if (matches.length > 0) {
            const best = matches[0]
            items[i].validatedSymbol = best.symbol
            items[i].name = items[i].name || best.name
            items[i].status = 'valid'
          } else {
            items[i].status = 'invalid'
          }
        } catch {
          items[i].status = 'invalid'
        }
        setResults([...items]) // trigger re-render after each validation
      }
    } catch (err) {
      const msg = err.message || ''
      if (msg.includes('parse') || msg.includes('JSON')) {
        setError('Could not read the holdings from this image. Please try a clearer screenshot where stock symbols and numbers are fully visible.')
      } else if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed')) {
        setError('Something went wrong connecting to the AI. Please check your connection and try again.')
      } else {
        setError('Could not analyze this image. Please try a different screenshot with your holdings clearly visible.')
      }
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleImport() {
    if (!results) return
    const toImport = results
      .filter(r => r.include && r.status === 'valid')
      .map(r => ({
        symbol: r.validatedSymbol || r.symbol,
        name: r.name,
        shares: r.shares,
        avg_cost: r.avg_cost,
      }))

    if (toImport.length === 0) { setError('No valid holdings to import'); return }

    setImporting(true)
    try {
      await onImport(toImport)
      onClose()
    } catch (err) {
      setError('Failed to save holdings. Please try again.')
    } finally {
      setImporting(false)
    }
  }

  const validCount = results?.filter(r => r.include && r.status === 'valid').length ?? 0

  return (
    <>
      <div className="modal-overlay" onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      }}>
      <div className="modal-panel" onClick={e => e.stopPropagation()} style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 9999, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--bg-card)', borderRadius: 16,
        border: '1px solid var(--border)',
        boxShadow: '0 24px 48px rgba(0,0,0,0.3)',
      }}>
        <div className="sheet-handle" />
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px', borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
              Import Portfolio
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              Upload a screenshot of your brokerage holdings
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'var(--bg-muted)', border: 'none', borderRadius: 20,
            width: 32, height: 32, cursor: 'pointer', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-secondary)',
          }}>✕</button>
        </div>

        <div style={{ padding: 24 }}>
          {/* Error */}
          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginBottom: 16,
              background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.2)',
              color: '#EF4444', fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {/* Upload zone */}
          {!results && (
            <>
              <div
                ref={dropRef}
                onDragOver={e => { e.preventDefault(); dropRef.current?.classList.add('drag-over') }}
                onDragLeave={() => dropRef.current?.classList.remove('drag-over')}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: '2px dashed var(--border)',
                  borderRadius: 12, padding: preview ? 0 : '40px 24px',
                  textAlign: 'center', cursor: 'pointer',
                  transition: 'all 0.2s',
                  overflow: 'hidden',
                  background: 'var(--bg-muted)',
                }}
              >
                {preview ? (
                  <img src={preview} alt="Portfolio screenshot" style={{
                    width: '100%', maxHeight: 300, objectFit: 'contain',
                    display: 'block',
                  }} />
                ) : (
                  <>
                    <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>📸</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                      Drop your screenshot here
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      or click to browse — PNG, JPG, WebP (max 10MB)
                    </div>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={e => handleFile(e.target.files?.[0])}
                style={{ display: 'none' }}
              />

              {preview && (
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button
                    onClick={() => { setFile(null); setPreview(null); setError('') }}
                    style={{
                      flex: 1, padding: '12px', borderRadius: 8, fontSize: 13,
                      border: '1px solid var(--border)', background: 'var(--bg-card)',
                      color: 'var(--text-secondary)', cursor: 'pointer',
                    }}
                  >
                    Change Image
                  </button>
                  <button
                    onClick={analyze}
                    disabled={analyzing}
                    style={{
                      flex: 2, padding: '12px', borderRadius: 8, fontSize: 14,
                      fontWeight: 600, border: 'none',
                      background: analyzing ? 'var(--text-muted)' : '#0A7C5C',
                      color: '#fff', cursor: analyzing ? 'wait' : 'pointer',
                    }}
                  >
                    {analyzing ? '🔍 Analyzing...' : '🤖 Extract Holdings'}
                  </button>
                </div>
              )}

              {analyzing && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, textAlign: 'center' }}>
                    AI is reading your portfolio screenshot...
                  </div>
                  {[1,2,3,4].map(i => (
                    <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0' }}>
                      <div className="skeleton" style={{ width: 22, height: 22, borderRadius: '50%' }} />
                      <div className="skeleton" style={{ width: 60, height: 14, borderRadius: 4 }} />
                      <div className="skeleton" style={{ flex: 1, height: 14, borderRadius: 4 }} />
                      <div className="skeleton" style={{ width: 50, height: 14, borderRadius: 4 }} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Results table */}
          {results && (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                Found <strong style={{ color: 'var(--text)' }}>{results.length}</strong> holdings.
                Review and edit before importing:
              </div>

              <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-muted)' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'center', width: 36 }}></th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Symbol</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Name</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Shares</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Avg Cost</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', width: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} style={{
                        borderBottom: '1px solid var(--border)',
                        opacity: r.include ? 1 : 0.4,
                      }}>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={r.include}
                            onChange={() => {
                              const updated = [...results]
                              updated[i].include = !updated[i].include
                              setResults(updated)
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <StatusBadge status={r.status} />
                            <input
                              value={r.validatedSymbol || r.symbol}
                              onChange={e => {
                                const updated = [...results]
                                updated[i].symbol = e.target.value.toUpperCase()
                                updated[i].validatedSymbol = e.target.value.toUpperCase()
                                setResults(updated)
                              }}
                              style={{
                                width: 70, padding: '4px 6px', borderRadius: 4,
                                border: '1px solid var(--border)', background: 'var(--bg-card)',
                                color: 'var(--text)', fontSize: 13, fontWeight: 700,
                              }}
                            />
                          </div>
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.name}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <input
                            type="number"
                            value={r.shares}
                            onChange={e => {
                              const updated = [...results]
                              updated[i].shares = parseFloat(e.target.value) || 0
                              setResults(updated)
                            }}
                            style={{
                              width: 70, padding: '4px 6px', borderRadius: 4, textAlign: 'right',
                              border: '1px solid var(--border)', background: 'var(--bg-card)',
                              color: 'var(--text)', fontSize: 13,
                            }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <input
                            type="number"
                            step="0.01"
                            value={r.avg_cost}
                            onChange={e => {
                              const updated = [...results]
                              updated[i].avg_cost = parseFloat(e.target.value) || 0
                              setResults(updated)
                            }}
                            style={{
                              width: 80, padding: '4px 6px', borderRadius: 4, textAlign: 'right',
                              border: '1px solid var(--border)', background: 'var(--bg-card)',
                              color: 'var(--text)', fontSize: 13,
                            }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <button
                            onClick={() => {
                              setResults(results.filter((_, j) => j !== i))
                            }}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: 'var(--text-muted)', fontSize: 14,
                            }}
                          >✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button
                  onClick={() => { setResults(null); setFile(null); setPreview(null) }}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 8, fontSize: 13,
                    border: '1px solid var(--border)', background: 'var(--bg-card)',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                  }}
                >
                  Start Over
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || validCount === 0}
                  style={{
                    flex: 2, padding: '12px', borderRadius: 8, fontSize: 14,
                    fontWeight: 600, border: 'none',
                    background: validCount > 0 ? '#0A7C5C' : 'var(--text-muted)',
                    color: '#fff',
                    cursor: importing || validCount === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {importing ? 'Importing...' : `Import ${validCount} Holding${validCount !== 1 ? 's' : ''}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      </div>
    </>
  )
}
