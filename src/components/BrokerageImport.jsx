import React, { useState } from 'react';

const BrokerageImport = ({ onClose, onImport }) => {
  const [step, setStep] = useState('brokerage'); // 'brokerage', 'upload', 'preview'
  const [selectedBrokerage, setSelectedBrokerage] = useState(null);
  const [fileInput, setFileInput] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editValues, setEditValues] = useState({});

  const brokerages = [
    {
      id: 'wealthsimple',
      name: 'Wealthsimple',
      instructions: 'Go to Activity → Download → Select "Positions" → CSV',
      columns: ['Symbol', 'Description', 'Quantity', 'Book Cost', 'Market Value'],
    },
    {
      id: 'questrade',
      name: 'Questrade',
      instructions: 'Go to Accounts → Positions → Export → CSV',
      columns: ['Symbol', 'Description', 'Quantity', 'Book Value', 'Market Value'],
    },
    {
      id: 'generic',
      name: 'Generic CSV',
      instructions: 'Upload a CSV with columns: Symbol, Shares, Avg Cost',
      columns: ['Symbol', 'Shares', 'Avg Cost'],
    },
  ];

  // Simple CSV parser
  const parseCSV = (content) => {
    const lines = content.trim().split('\n');
    if (lines.length < 2) throw new Error('CSV must have header and at least one data row');

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"(.*)"$/, '$1'));
    const rows = lines.slice(1).map(line => {
      const values = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim().replace(/^"(.*)"$/, '$1'));
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim().replace(/^"(.*)"$/, '$1'));
      return values;
    });

    return { headers, rows };
  };

  // Wealthsimple parser
  const parseWealthsimple = (headers, rows) => {
    const symbolIdx = headers.findIndex(h => h.toLowerCase() === 'symbol');
    const descIdx = headers.findIndex(h => h.toLowerCase() === 'description');
    const qtyIdx = headers.findIndex(h => h.toLowerCase() === 'quantity');
    const costIdx = headers.findIndex(h => h.toLowerCase() === 'book cost');

    if (symbolIdx === -1 || qtyIdx === -1 || costIdx === -1) {
      throw new Error('Missing required Wealthsimple columns: Symbol, Quantity, Book Cost');
    }

    return rows.map(row => {
      const symbol = row[symbolIdx]?.trim() || '';
      const name = row[descIdx]?.trim() || '';
      const shares = parseFloat(row[qtyIdx]) || 0;
      const totalCost = parseFloat(row[costIdx]) || 0;
      const avg_cost = shares > 0 ? totalCost / shares : 0;

      // Add .TO for Canadian stocks if not already present
      const finalSymbol = symbol && !symbol.includes('.') && !symbol.startsWith('^')
        ? `${symbol}.TO`
        : symbol;

      return {
        symbol: finalSymbol,
        name,
        shares,
        avg_cost,
      };
    });
  };

  // Questrade parser
  const parseQuestrade = (headers, rows) => {
    const symbolIdx = headers.findIndex(h => h.toLowerCase() === 'symbol');
    const descIdx = headers.findIndex(h => h.toLowerCase() === 'description');
    const qtyIdx = headers.findIndex(h => h.toLowerCase() === 'quantity');
    const bookValueIdx = headers.findIndex(h => h.toLowerCase() === 'book value');

    if (symbolIdx === -1 || qtyIdx === -1 || bookValueIdx === -1) {
      throw new Error('Missing required Questrade columns: Symbol, Quantity, Book Value');
    }

    return rows.map(row => {
      const symbol = row[symbolIdx]?.trim() || '';
      const name = row[descIdx]?.trim() || '';
      const shares = parseFloat(row[qtyIdx]) || 0;
      const totalCost = parseFloat(row[bookValueIdx]) || 0;
      const avg_cost = shares > 0 ? totalCost / shares : 0;

      return {
        symbol,
        name,
        shares,
        avg_cost,
      };
    });
  };

  // Generic CSV parser
  const parseGeneric = (headers, rows) => {
    const symbolIdx = headers.findIndex(h => h.toLowerCase() === 'symbol');
    const sharesIdx = headers.findIndex(h => h.toLowerCase() === 'shares');
    const costIdx = headers.findIndex(h => h.toLowerCase() === 'avg cost' || h.toLowerCase() === 'avg_cost');

    if (symbolIdx === -1 || sharesIdx === -1 || costIdx === -1) {
      throw new Error('Missing required columns: Symbol, Shares, Avg Cost');
    }

    return rows.map(row => ({
      symbol: row[symbolIdx]?.trim() || '',
      name: '',
      shares: parseFloat(row[sharesIdx]) || 0,
      avg_cost: parseFloat(row[costIdx]) || 0,
    }));
  };

  const handleFileSelect = (file) => {
    setError(null);
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const { headers, rows } = parseCSV(content);

        let parsed;
        if (selectedBrokerage === 'wealthsimple') {
          parsed = parseWealthsimple(headers, rows);
        } else if (selectedBrokerage === 'questrade') {
          parsed = parseQuestrade(headers, rows);
        } else {
          parsed = parseGeneric(headers, rows);
        }

        // Filter out empty rows
        const filtered = parsed.filter(row => row.symbol && row.shares);

        if (filtered.length === 0) {
          throw new Error('No valid holdings found in CSV');
        }

        setPreviewData(filtered);
        setStep('preview');
      } catch (err) {
        setError(err.message || 'Failed to parse CSV file');
      }
    };
    reader.readAsText(file);
  };

  const handleEdit = (index, field) => {
    setEditing({ index, field });
    setEditValues({ value: previewData[index][field] });
  };

  const handleEditSubmit = (index, field) => {
    const newData = [...previewData];
    const value = editValues.value;

    if (field === 'shares' || field === 'avg_cost') {
      newData[index][field] = parseFloat(value) || 0;
    } else {
      newData[index][field] = value;
    }

    setPreviewData(newData);
    setEditing(null);
  };

  const handleRemoveRow = (index) => {
    setPreviewData(previewData.filter((_, i) => i !== index));
  };

  const handleImport = () => {
    onImport(previewData);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '16px',
    }}>
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        maxWidth: '600px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h2 style={{
            margin: '0',
            color: 'var(--text)',
            fontSize: '20px',
            fontWeight: '600',
          }}>
            Import Holdings
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {/* STEP 1: Brokerage Selection */}
          {step === 'brokerage' && (
            <div>
              <p style={{
                margin: '0 0 16px 0',
                color: 'var(--text-secondary)',
                fontSize: '14px',
              }}>
                Select your brokerage to get started:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {brokerages.map(brokerage => (
                  <div
                    key={brokerage.id}
                    onClick={() => setSelectedBrokerage(brokerage.id)}
                    style={{
                      padding: '16px',
                      border: selectedBrokerage === brokerage.id
                        ? '2px solid var(--gold)'
                        : '1px solid var(--border)',
                      borderRadius: '8px',
                      backgroundColor: selectedBrokerage === brokerage.id
                        ? 'var(--bg-hover)'
                        : 'var(--bg)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <h3 style={{
                      margin: '0 0 8px 0',
                      color: 'var(--text)',
                      fontSize: '16px',
                      fontWeight: '600',
                    }}>
                      {brokerage.name}
                    </h3>
                    <p style={{
                      margin: '0',
                      color: 'var(--text-secondary)',
                      fontSize: '13px',
                    }}>
                      {brokerage.instructions}
                    </p>
                  </div>
                ))}
              </div>

              <div style={{
                marginTop: '24px',
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
              }}>
                <button
                  onClick={onClose}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'transparent',
                    color: 'var(--text)',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep('upload')}
                  disabled={!selectedBrokerage}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: selectedBrokerage ? 'var(--gold)' : 'var(--bg-muted)',
                    color: selectedBrokerage ? 'var(--bg)' : 'var(--text-muted)',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: selectedBrokerage ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s ease',
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: File Upload */}
          {step === 'upload' && (
            <div>
              <p style={{
                margin: '0 0 16px 0',
                color: 'var(--text-secondary)',
                fontSize: '14px',
              }}>
                {brokerages.find(b => b.id === selectedBrokerage)?.instructions}
              </p>

              {/* Drag and Drop Zone */}
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  handleFileSelect(file);
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px',
                  border: '2px dashed var(--border)',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  marginBottom: '16px',
                }}
              >
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--text-secondary)"
                  strokeWidth="2"
                  style={{ marginBottom: '12px' }}
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p style={{
                  margin: '0 0 8px 0',
                  color: 'var(--text)',
                  fontSize: '14px',
                  fontWeight: '600',
                }}>
                  Drag and drop your CSV file here
                </p>
                <p style={{
                  margin: '0',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                }}>
                  or click to select
                </p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => handleFileSelect(e.target.files[0])}
                  style={{
                    display: 'none',
                  }}
                />
              </label>

              {error && (
                <div style={{
                  padding: '12px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--red-bg)',
                  color: 'var(--red)',
                  fontSize: '13px',
                  marginBottom: '16px',
                }}>
                  {error}
                </div>
              )}

              <div style={{
                marginTop: '24px',
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
              }}>
                <button
                  onClick={() => {
                    setStep('brokerage');
                    setError(null);
                  }}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'transparent',
                    color: 'var(--text)',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Preview and Import */}
          {step === 'preview' && (
            <div>
              <h3 style={{
                margin: '0 0 16px 0',
                color: 'var(--text)',
                fontSize: '16px',
                fontWeight: '600',
              }}>
                Preview {previewData.length} {previewData.length === 1 ? 'holding' : 'holdings'}
              </h3>

              {/* Table */}
              <div style={{
                overflowX: 'auto',
                marginBottom: '16px',
                border: '1px solid var(--border)',
                borderRadius: '8px',
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '13px',
                }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg)' }}>
                      <th style={{
                        padding: '12px',
                        textAlign: 'left',
                        color: 'var(--text-secondary)',
                        fontWeight: '600',
                        borderBottom: '1px solid var(--border)',
                      }}>
                        Symbol
                      </th>
                      <th style={{
                        padding: '12px',
                        textAlign: 'left',
                        color: 'var(--text-secondary)',
                        fontWeight: '600',
                        borderBottom: '1px solid var(--border)',
                      }}>
                        Name
                      </th>
                      <th style={{
                        padding: '12px',
                        textAlign: 'right',
                        color: 'var(--text-secondary)',
                        fontWeight: '600',
                        borderBottom: '1px solid var(--border)',
                      }}>
                        Shares
                      </th>
                      <th style={{
                        padding: '12px',
                        textAlign: 'right',
                        color: 'var(--text-secondary)',
                        fontWeight: '600',
                        borderBottom: '1px solid var(--border)',
                      }}>
                        Avg Cost
                      </th>
                      <th style={{
                        padding: '12px',
                        textAlign: 'center',
                        color: 'var(--text-secondary)',
                        fontWeight: '600',
                        borderBottom: '1px solid var(--border)',
                        width: '40px',
                      }}>
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{
                          padding: '12px',
                          color: 'var(--text)',
                          fontWeight: '600',
                        }}>
                          {editing?.index === idx && editing?.field === 'symbol' ? (
                            <input
                              autoFocus
                              value={editValues.value}
                              onChange={(e) => setEditValues({ value: e.target.value })}
                              onBlur={() => handleEditSubmit(idx, 'symbol')}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEditSubmit(idx, 'symbol');
                              }}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                border: '1px solid var(--border)',
                                backgroundColor: 'var(--bg)',
                                color: 'var(--text)',
                                width: '100%',
                                fontSize: '13px',
                              }}
                            />
                          ) : (
                            <span
                              onClick={() => handleEdit(idx, 'symbol')}
                              style={{ cursor: 'pointer' }}
                            >
                              {row.symbol}
                            </span>
                          )}
                        </td>
                        <td style={{
                          padding: '12px',
                          color: 'var(--text-secondary)',
                        }}>
                          {editing?.index === idx && editing?.field === 'name' ? (
                            <input
                              autoFocus
                              value={editValues.value}
                              onChange={(e) => setEditValues({ value: e.target.value })}
                              onBlur={() => handleEditSubmit(idx, 'name')}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEditSubmit(idx, 'name');
                              }}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                border: '1px solid var(--border)',
                                backgroundColor: 'var(--bg)',
                                color: 'var(--text)',
                                width: '100%',
                                fontSize: '13px',
                              }}
                            />
                          ) : (
                            <span
                              onClick={() => handleEdit(idx, 'name')}
                              style={{ cursor: 'pointer' }}
                            >
                              {row.name || '—'}
                            </span>
                          )}
                        </td>
                        <td style={{
                          padding: '12px',
                          textAlign: 'right',
                          color: 'var(--text)',
                        }}>
                          {editing?.index === idx && editing?.field === 'shares' ? (
                            <input
                              autoFocus
                              type="number"
                              value={editValues.value}
                              onChange={(e) => setEditValues({ value: e.target.value })}
                              onBlur={() => handleEditSubmit(idx, 'shares')}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEditSubmit(idx, 'shares');
                              }}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                border: '1px solid var(--border)',
                                backgroundColor: 'var(--bg)',
                                color: 'var(--text)',
                                width: '80px',
                                fontSize: '13px',
                                textAlign: 'right',
                              }}
                            />
                          ) : (
                            <span
                              onClick={() => handleEdit(idx, 'shares')}
                              style={{ cursor: 'pointer' }}
                            >
                              {row.shares.toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td style={{
                          padding: '12px',
                          textAlign: 'right',
                          color: 'var(--text)',
                        }}>
                          {editing?.index === idx && editing?.field === 'avg_cost' ? (
                            <input
                              autoFocus
                              type="number"
                              value={editValues.value}
                              onChange={(e) => setEditValues({ value: e.target.value })}
                              onBlur={() => handleEditSubmit(idx, 'avg_cost')}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEditSubmit(idx, 'avg_cost');
                              }}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                border: '1px solid var(--border)',
                                backgroundColor: 'var(--bg)',
                                color: 'var(--text)',
                                width: '80px',
                                fontSize: '13px',
                                textAlign: 'right',
                              }}
                            />
                          ) : (
                            <span
                              onClick={() => handleEdit(idx, 'avg_cost')}
                              style={{ cursor: 'pointer' }}
                            >
                              ${row.avg_cost.toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td style={{
                          padding: '12px',
                          textAlign: 'center',
                        }}>
                          <button
                            onClick={() => handleRemoveRow(idx)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--red)',
                              cursor: 'pointer',
                              fontSize: '16px',
                              padding: '0',
                            }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {error && (
                <div style={{
                  padding: '12px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--red-bg)',
                  color: 'var(--red)',
                  fontSize: '13px',
                  marginBottom: '16px',
                }}>
                  {error}
                </div>
              )}

              <div style={{
                marginTop: '24px',
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
              }}>
                <button
                  onClick={() => {
                    setStep('upload');
                    setError(null);
                  }}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'transparent',
                    color: 'var(--text)',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={previewData.length === 0}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: previewData.length > 0 ? 'var(--green)' : 'var(--bg-muted)',
                    color: previewData.length > 0 ? 'var(--bg)' : 'var(--text-muted)',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: previewData.length > 0 ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s ease',
                  }}
                >
                  Import {previewData.length} {previewData.length === 1 ? 'Holding' : 'Holdings'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BrokerageImport;
