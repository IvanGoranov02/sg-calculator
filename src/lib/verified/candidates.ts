/**
 * Candidates for verified (SEC-sourced, cross-checked) fundamentals: the largest US-listed
 * companies by market cap, in rank order (snapshot of public/us-companies.json). Only the ones
 * that pass verification are served from the verified store; the rest use the regular pipeline.
 */
export const VERIFIED_CANDIDATES: readonly string[] = ["NVDA","AAPL","GOOGL","MSFT","AMZN","AVGO","META","TSLA","BRK-B","LLY","MU","WMT","JPM","AMD","ASML","XOM","V","ORCL","JNJ","INTC","CSCO","MA","COST","CYATY","CAT","ABBV","BAC","LRCX","CVX","ARM","AMAT","UNH","NFLX","GE","KO","PG","MS","PLTR","HSBC","HD","GS","MRK","BABA","AZN","NVS","PM","RY","IBM","TXN","DELL","KLAC","GEV","WFC","RTX","KXIAY","SHEL","LIN","SNDK","TM","MRVL","QCOM","C","MUFG","PANW","SAP","AXP","RTNTF","BHP","MCD","ADI","TTE","PEP","ANET","TMUS","STX","NVO","AMGN","VZ","TD","APP","NEE","TJX","WDC","TMO","SAN","DIS","CRWD","APH","BA","RIO","BLK","UNP","GILD","ABT","T","DE","DTEGY","SCHW","UBS","ETN","GLW","SMERY","CRM","BUD","ISRG","PFE","SMFG","WELL","HTHIY","SCCO","UBER","IBKR","COP","SHOP","BX","HON","PLD","DHR","BTI","SONY","BKNG","CB","SPGI","BBVA","ENB","UL","CVS","PDD","LMT","MO","HDB","PGR","LOW","SYK","BMY","NOW","MFG","VRT","BMO","PBR","VRTX","IFNNY","COF","ATEYY","PH","BP","ACN","SBUX","SNY","EQIX","NEM","FTNT","MDT","SO","PWR","CDNS","MAR","GSK","SPOT","ADBE","TT","HWM","CM","SNHIY","BN","BNS","BNY","DUK","CNQ","GD","MCK","ADP","IBN","CME","UPS","EQNR","PNC","CEG","FCX","AMT","ELV","CMI","SNPS","WM","NET","WMB","JCI","MNST","CSX","KKR","USB","CMCSA","ING","MGCLY","DDOG","ITUB","SNOW","HCA","BCS","SLB"];

const SET = new Set(VERIFIED_CANDIDATES);

export function isVerifiedCandidate(symbol: string): boolean {
  return SET.has(symbol.trim().toUpperCase());
}
