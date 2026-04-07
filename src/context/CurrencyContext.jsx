import { createContext, useContext, useState, useEffect } from 'react'
import { fetchQuote } from '../api/yahoo.js'

const CurrencyContext = createContext(null)

export const WORLD_CURRENCIES = [
  { code: 'USD', name: 'US Dollar',           sym: '$'  },
  { code: 'CAD', name: 'Canadian Dollar',     sym: 'C$' },
  { code: 'EUR', name: 'Euro',                sym: '€'  },
  { code: 'GBP', name: 'British Pound',       sym: '£'  },
  { code: 'JPY', name: 'Japanese Yen',        sym: '¥'  },
  { code: 'CHF', name: 'Swiss Franc',         sym: 'Fr' },
  { code: 'AUD', name: 'Australian Dollar',   sym: 'A$' },
  { code: 'NZD', name: 'New Zealand Dollar',  sym: 'NZ$'},
  { code: 'HKD', name: 'Hong Kong Dollar',    sym: 'HK$'},
  { code: 'SGD', name: 'Singapore Dollar',    sym: 'S$' },
  { code: 'SEK', name: 'Swedish Krona',       sym: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone',     sym: 'kr' },
  { code: 'DKK', name: 'Danish Krone',        sym: 'kr' },
  { code: 'CNY', name: 'Chinese Yuan',        sym: '¥'  },
  { code: 'INR', name: 'Indian Rupee',        sym: '₹'  },
  { code: 'KRW', name: 'South Korean Won',    sym: '₩'  },
  { code: 'MXN', name: 'Mexican Peso',        sym: 'MX$'},
  { code: 'BRL', name: 'Brazilian Real',      sym: 'R$' },
  { code: 'ZAR', name: 'South African Rand',  sym: 'R'  },
  { code: 'TRY', name: 'Turkish Lira',        sym: '₺'  },
  { code: 'RUB', name: 'Russian Ruble',       sym: '₽'  },
  { code: 'SAR', name: 'Saudi Riyal',         sym: '﷼'  },
  { code: 'AED', name: 'UAE Dirham',          sym: 'د.إ'},
  { code: 'ILS', name: 'Israeli Shekel',      sym: '₪'  },
  { code: 'PLN', name: 'Polish Zloty',        sym: 'zł' },
  { code: 'CZK', name: 'Czech Koruna',        sym: 'Kč' },
  { code: 'HUF', name: 'Hungarian Forint',    sym: 'Ft' },
  { code: 'RON', name: 'Romanian Leu',        sym: 'lei'},
  { code: 'IDR', name: 'Indonesian Rupiah',   sym: 'Rp' },
  { code: 'MYR', name: 'Malaysian Ringgit',   sym: 'RM' },
  { code: 'THB', name: 'Thai Baht',           sym: '฿'  },
  { code: 'PHP', name: 'Philippine Peso',     sym: '₱'  },
  { code: 'VND', name: 'Vietnamese Dong',     sym: '₫'  },
  { code: 'TWD', name: 'Taiwan Dollar',       sym: 'NT$'},
  { code: 'PKR', name: 'Pakistani Rupee',     sym: '₨'  },
  { code: 'BDT', name: 'Bangladeshi Taka',    sym: '৳'  },
  { code: 'EGP', name: 'Egyptian Pound',      sym: 'E£' },
  { code: 'NGN', name: 'Nigerian Naira',      sym: '₦'  },
  { code: 'KES', name: 'Kenyan Shilling',     sym: 'KSh'},
  { code: 'GHS', name: 'Ghanaian Cedi',       sym: '₵'  },
  { code: 'CLP', name: 'Chilean Peso',        sym: 'CL$'},
  { code: 'COP', name: 'Colombian Peso',      sym: 'CO$'},
  { code: 'PEN', name: 'Peruvian Sol',        sym: 'S/' },
  { code: 'ARS', name: 'Argentine Peso',      sym: 'AR$'},
]

const CURRENCY_SYM = Object.fromEntries(WORLD_CURRENCIES.map(c => [c.code, c.sym]))

function getCurrencySym(code) {
  return CURRENCY_SYM[code] ?? code
}

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState(
    () => localStorage.getItem('preferred_currency') ?? 'USD'
  )
  // sourceRates: maps source currency → USD rate (1 unit of source = X USD)
  const [sourceRates, setSourceRates] = useState({ USD: 1, CAD: 0.727 })
  // usdToDisplay: 1 USD = X display_currency
  const [usdToDisplay, setUsdToDisplay] = useState(1)
  const [rateLoading, setRateLoading] = useState(false)

  // Fetch CADUSD rate once on mount
  useEffect(() => {
    fetchQuote('CADUSD=X').then(q => {
      if (q?.price) setSourceRates(prev => ({ ...prev, CAD: q.price }))
    }).catch(() => {})
  }, [])

  // Fetch USD → display currency rate whenever currency changes
  useEffect(() => {
    if (currency === 'USD') {
      setUsdToDisplay(1)
      return
    }
    if (currency === 'CAD') {
      setUsdToDisplay(null)
      return
    }
    let cancelled = false
    setRateLoading(true)
    fetchQuote(`USD${currency}=X`)
      .then(q => { if (!cancelled && q?.price) setUsdToDisplay(q.price) })
      .catch(() => { if (!cancelled) setUsdToDisplay(1) })
      .finally(() => { if (!cancelled) setRateLoading(false) })
    return () => { cancelled = true }
  }, [currency])

  // Ensure we have a source→USD rate for the given currency (called when switching markets)
  function ensureSourceRate(currencyCode) {
    const code = (currencyCode ?? 'USD').toUpperCase()
    // GBp (pence) → GBP
    const normalized = code === 'GBP' || code === 'GBP' ? 'GBP' : code
    if (sourceRates[normalized] != null) return
    fetchQuote(`${normalized}USD=X`)
      .then(q => {
        if (q?.price) setSourceRates(prev => ({ ...prev, [normalized]: q.price }))
      })
      .catch(() => {
        // Fallback: set to 1 to avoid blocking
        setSourceRates(prev => ({ ...prev, [normalized]: 1 }))
      })
  }

  function setCurrency(c) {
    setCurrencyState(c)
    localStorage.setItem('preferred_currency', c)
  }

  const cadUsd = sourceRates.CAD ?? 0.727

  // Convert an amount from its native currency to the user's display currency.
  // fromCurrency can be any currency code (USD, CAD, GBP, EUR, JPY, GBp, etc.)
  function convert(amount, fromCurrency = 'CAD') {
    if (amount == null) return null
    let from = (fromCurrency ?? 'CAD').toUpperCase()

    // Handle GBp (pence) — London stocks are priced in pence, convert to GBP first
    let adjusted = amount
    if (fromCurrency === 'GBp') {
      adjusted = amount / 100
      from = 'GBP'
    }

    // Convert source to USD
    let inUsd
    if (from === 'USD') {
      inUsd = adjusted
    } else {
      const rate = sourceRates[from]
      if (rate == null) {
        // Rate not loaded yet, try to fetch it
        ensureSourceRate(from)
        inUsd = adjusted // fallback: assume 1:1 until rate loads
      } else {
        inUsd = adjusted * rate
      }
    }

    // Convert USD to display currency
    if (currency === 'USD') return inUsd
    if (currency === 'CAD') return inUsd / cadUsd
    if (usdToDisplay == null) return inUsd
    return inUsd * usdToDisplay
  }

  const sym = getCurrencySym(currency)

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, cadUsd, usdToDisplay, convert, sym, rateLoading, ensureSourceRate }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  return useContext(CurrencyContext)
}
