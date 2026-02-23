insert into currencies (code, name, symbol, is_crypto, is_fiat, decimals) values
  ('EUR',  'Euro',                        '€',  false, true,  2),
  ('USD',  'US Dollar',                   '$',  false, true,  2),
  ('DKK',  'Danish Krone',                'kr', false, true,  2),
  ('ARS',  'Argentine Peso',              '$',  false, true,  2),
  ('GBP',  'British Pound',               '£',  false, true,  2),
  ('CHF',  'Swiss Franc',                 'Fr', false, true,  2),
  ('NOK',  'Norwegian Krone',             'kr', false, true,  2),
  ('SEK',  'Swedish Krona',               'kr', false, true,  2),
  ('ETH',  'Ethereum',                    'Ξ',  true,  false, 8),
  ('BTC',  'Bitcoin',                     '₿',  true,  false, 8),
  ('USDT', 'Tether',                      '$',  true,  false, 2),
  ('USDC', 'USD Coin',                    '$',  true,  false, 2),
  ('SOL',  'Solana',                      '◎',  true,  false, 8),
  ('VOO',  'Vanguard S&P 500 ETF',        null, false, false, 2),
  ('VWO',  'Vanguard Emerging Markets ETF', null, false, false, 2)
on conflict (code) do nothing;
