import React, { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';

const CanadianTaxInfo = ({ symbol, metrics = {}, holdings = [] }) => {
  const { isDark } = useTheme();
  const { currency, convert, sym } = useCurrency();

  // Determine stock type based on symbol
  const getStockType = () => {
    if (symbol.endsWith('.TO') || symbol.endsWith('.V')) {
      return 'canadian';
    } else if (symbol.endsWith('.L')) {
      return 'uk';
    } else {
      return 'us';
    }
  };

  const stockType = getStockType();

  // Get dividend info
  const dividendYield = metrics?.dividendYield || 0;
  const dividendRate = metrics?.dividendRate || 0;
  const payoutRatio = metrics?.payoutRatio || 0;
  const hasDividend = dividendRate > 0;

  // Calculate withholding tax based on stock type
  const getWithholdingInfo = () => {
    if (!hasDividend) return null;

    switch (stockType) {
      case 'canadian':
        return {
          rate: 0,
          country: 'Canada',
          description: 'No withholding tax on eligible Canadian dividends',
          treaty: null,
        };
      case 'us':
        return {
          rate: 0.15,
          country: 'USA',
          description: '15% withholding tax on US dividends (Canada-US treaty)',
          treaty: 'US-Canada Treaty',
        };
      case 'uk':
        return {
          rate: 0,
          country: 'UK',
          description: '0% withholding tax (UK-Canada tax treaty)',
          treaty: 'UK-Canada Treaty',
        };
      default:
        return null;
    }
  };

  const withholdingInfo = getWithholdingInfo();

  // Get dividend tax credit eligibility badge
  const getDividendTaxCreditInfo = () => {
    switch (stockType) {
      case 'canadian':
        return {
          eligible: true,
          badge: 'Eligible Canadian Dividend',
          color: 'var(--green)',
          bgColor: 'var(--green-bg)',
          explanation: 'Eligible for Canadian Dividend Tax Credit (DTC). Taxed favorably in personal accounts.',
        };
      case 'us':
        return {
          eligible: false,
          badge: 'Foreign Dividend — 15% Withholding',
          color: 'var(--gold)',
          bgColor: '#f9f3e6',
          explanation: 'US dividends subject to 15% withholding in most accounts.',
        };
      case 'uk':
        return {
          eligible: false,
          badge: 'Foreign Dividend — 0% Withholding',
          color: '#4a90e2',
          bgColor: '#e6f0ff',
          explanation: 'UK dividends benefit from treaty — no withholding tax in Canada.',
        };
      default:
        return {
          eligible: false,
          badge: 'Foreign Dividend',
          color: 'var(--text-secondary)',
          bgColor: 'var(--bg-card)',
          explanation: 'Subject to withholding tax depending on country of origin.',
        };
    }
  };

  // Get TFSA/RRSP suitability
  const getAccountSuitability = () => {
    if (!hasDividend) {
      return {
        recommendation: 'TFSA Friendly',
        color: 'var(--green)',
        bgColor: 'var(--green-bg)',
        explanation: 'Growth stocks with no dividends are ideal for TFSA — capital gains grow tax-free.',
      };
    }

    switch (stockType) {
      case 'canadian':
        return {
          recommendation: 'Great for TFSA',
          color: 'var(--green)',
          bgColor: 'var(--green-bg)',
          explanation: 'Canadian dividends in TFSA are completely tax-free. No withholding or DTC needed.',
        };
      case 'us':
        return {
          recommendation: 'Better in RRSP',
          color: 'var(--gold)',
          bgColor: '#f9f3e6',
          explanation: 'In RRSP, US withholding tax is eliminated via treaty. In TFSA, you pay 15% tax.',
        };
      case 'uk':
        return {
          recommendation: 'Either Account Works',
          color: 'var(--gold)',
          bgColor: '#f9f3e6',
          explanation: 'No withholding tax due to treaty, so TFSA and RRSP are equally suitable.',
        };
      default:
        return {
          recommendation: 'Consider RRSP',
          color: 'var(--text-secondary)',
          bgColor: 'var(--bg-card)',
          explanation: 'Check withholding tax rules for this stock type.',
        };
    }
  };

  // Calculate effective yield after withholding
  const calculateEffectiveYield = () => {
    if (!hasDividend || !withholdingInfo) return null;

    const yieldAfterWithholding = dividendYield * (1 - withholdingInfo.rate);
    const withholdingAmount = dividendYield * withholdingInfo.rate;

    return {
      originalYield: dividendYield,
      withholdingAmount,
      yieldAfterWithholding,
      rrspYield: withholdingInfo.rate === 0 ? dividendYield : dividendYield, // RRSP avoids withholding
    };
  };

  // Get account allocation tip
  const getAllocationTip = () => {
    if (!hasDividend) {
      return 'Growth stocks work well in both TFSA and RRSP. Consider TFSA to avoid capital gains taxes on appreciation.';
    }

    switch (stockType) {
      case 'canadian':
        return 'Perfect for TFSA — Canadian dividends are completely tax-free, and you retain DTC benefits if needed elsewhere.';
      case 'us':
        return `Consider holding in RRSP to avoid 15% US dividend withholding tax. At ${(dividendYield * 100).toFixed(2)}% yield, withholding costs ~${((dividendYield * 0.15) * 100).toFixed(2)}% of value annually.`;
      case 'uk':
        return 'UK stocks work well in either TFSA or RRSP due to the treaty. Choose based on overall portfolio allocation.';
      default:
        return 'Review the withholding tax implications for your account type.';
    }
  };

  const creditInfo = getDividendTaxCreditInfo();
  const suitabilityInfo = getAccountSuitability();
  const effectiveYield = calculateEffectiveYield();
  const allocationTip = getAllocationTip();

  const styles = {
    container: {
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: '16px',
    },
    card: {
      backgroundColor: 'var(--bg-card)',
      border: `1px solid var(--border)`,
      borderRadius: '8px',
      padding: '16px',
      transition: 'border-color 0.2s',
    },
    cardTitle: {
      fontSize: '13px',
      fontWeight: '600',
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    infoIcon: {
      width: '16px',
      height: '16px',
      borderRadius: '50%',
      border: `1px solid var(--text-muted)`,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '11px',
      color: 'var(--text-muted)',
      cursor: 'help',
    },
    badge: {
      display: 'inline-flex',
      padding: '6px 12px',
      borderRadius: '16px',
      fontSize: '13px',
      fontWeight: '500',
      marginBottom: '12px',
    },
    explanation: {
      fontSize: '13px',
      color: 'var(--text)',
      lineHeight: '1.5',
      margin: '8px 0 0 0',
    },
    suitabilityBadge: {
      display: 'inline-flex',
      padding: '8px 14px',
      borderRadius: '6px',
      fontSize: '14px',
      fontWeight: '600',
      marginBottom: '12px',
    },
    withholdingTable: {
      width: '100%',
      borderCollapse: 'collapse',
      marginBottom: '12px',
    },
    withholdingTableCell: {
      padding: '8px',
      borderBottom: `1px solid var(--border)`,
      fontSize: '13px',
      textAlign: 'left',
    },
    withholdingTableHeader: {
      fontWeight: '600',
      color: 'var(--text-muted)',
      backgroundColor: 'var(--bg)',
      padding: '8px',
      borderBottom: `1px solid var(--border)`,
      fontSize: '12px',
    },
    tipBox: {
      backgroundColor: 'var(--bg)',
      border: `1px solid var(--border)`,
      borderRadius: '6px',
      padding: '12px',
      fontSize: '13px',
      lineHeight: '1.5',
      color: 'var(--text)',
    },
    gridTwoCol: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '8px',
      marginBottom: '12px',
    },
    gridItem: {
      fontSize: '13px',
    },
    gridLabel: {
      fontWeight: '500',
      color: 'var(--text-muted)',
      marginBottom: '4px',
    },
    gridValue: {
      fontSize: '16px',
      fontWeight: '600',
      color: 'var(--text)',
    },
    noDataMessage: {
      fontSize: '13px',
      color: 'var(--text-muted)',
      fontStyle: 'italic',
    },
  };

  return (
    <div style={styles.container}>
      {/* Dividend Tax Credit Eligibility */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>
          Dividend Tax Credit
          <div style={styles.infoIcon} title="Canadian tax credits for eligible dividends">?</div>
        </div>
        <div
          style={{
            ...styles.badge,
            color: creditInfo.color,
            backgroundColor: creditInfo.bgColor,
          }}
        >
          {creditInfo.badge}
        </div>
        <p style={styles.explanation}>{creditInfo.explanation}</p>
      </div>

      {/* TFSA / RRSP Suitability */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>
          Account Suitability
          <div style={styles.infoIcon} title="Best account type for this stock">?</div>
        </div>
        <div
          style={{
            ...styles.suitabilityBadge,
            color: suitabilityInfo.color,
            backgroundColor: suitabilityInfo.bgColor,
          }}
        >
          {suitabilityInfo.recommendation}
        </div>
        <p style={styles.explanation}>{suitabilityInfo.explanation}</p>
      </div>

      {/* Withholding Tax Calculator */}
      {hasDividend && withholdingInfo && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>
            Dividend Withholding Tax
            <div style={styles.infoIcon} title="Tax withheld on foreign dividends">?</div>
          </div>

          <div style={styles.gridTwoCol}>
            <div style={styles.gridItem}>
              <div style={styles.gridLabel}>Annual Dividend / Share</div>
              <div style={styles.gridValue}>
                {sym}{dividendRate.toFixed(2)}
              </div>
            </div>
            <div style={styles.gridItem}>
              <div style={styles.gridLabel}>Yield</div>
              <div style={styles.gridValue}>
                {(dividendYield * 100).toFixed(2)}%
              </div>
            </div>
          </div>

          {withholdingInfo.rate > 0 && effectiveYield && (
            <>
              <table style={styles.withholdingTable}>
                <thead>
                  <tr>
                    <th style={styles.withholdingTableHeader}>Account Type</th>
                    <th style={styles.withholdingTableHeader}>Effective Yield</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={styles.withholdingTableCell}>TFSA</td>
                    <td style={styles.withholdingTableCell}>
                      {(effectiveYield.yieldAfterWithholding * 100).toFixed(2)}%
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '6px' }}>
                        (after {(withholdingInfo.rate * 100).toFixed(0)}% withholding)
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style={styles.withholdingTableCell}>RRSP</td>
                    <td style={styles.withholdingTableCell}>
                      {(dividendYield * 100).toFixed(2)}%
                      <span style={{ color: 'var(--green)', fontSize: '12px', marginLeft: '6px' }}>
                        (no withholding)
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p style={styles.explanation}>
                The difference: In RRSP, the US-Canada tax treaty waives the {(withholdingInfo.rate * 100).toFixed(0)}% withholding. In TFSA, you pay full withholding tax.
              </p>
            </>
          )}

          {withholdingInfo.rate === 0 && (
            <p style={styles.explanation}>
              No withholding tax due to {withholdingInfo.treaty ? `${withholdingInfo.treaty}` : 'tax treaty benefits'}.
            </p>
          )}
        </div>
      )}

      {!hasDividend && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>
            Dividend Withholding Tax
            <div style={styles.infoIcon} title="Tax on foreign dividends">?</div>
          </div>
          <p style={styles.noDataMessage}>This stock does not currently pay a dividend.</p>
        </div>
      )}

      {/* Account Allocation Tip */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>
          Allocation Tip
          <div style={styles.infoIcon} title="Recommended account placement">?</div>
        </div>
        <div style={styles.tipBox}>{allocationTip}</div>
      </div>
    </div>
  );
};

export default CanadianTaxInfo;
