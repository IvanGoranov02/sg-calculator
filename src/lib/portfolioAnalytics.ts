import { convertPortfolioMoney, type PortfolioFxRates } from "@/lib/portfolioFx";
import { groupSectorCompanies, type SectorCompany, type SectorCompanySource } from "@/lib/portfolioAllocation";

export type AnalyticsRow = {
  symbol: string;
  name: string | null;
  sector: string | null;
  holdingCcy: string;
  mv: number | null;
  cost: number;
  pl: number | null;
  estAnnual: number | null;
  /** Session move from the live quote. Null for broker-only prices. */
  dayChangePct: number | null;
};

export type PortfolioAnalyticsData = {
  base: string;
  totalValue: number;
  totalCost: number;
  totalPl: number;
  totalPlPct: number | null;
  totalIncome: number;
  portfolioYield: number | null;
  unconverted: number;
  holdings: { symbol: string; name: string | null; value: number }[];
  sectors: { name: string; value: number; companies: SectorCompany[] }[];
  hasRealSectors: boolean;
  best: { symbol: string; name: string | null; plPct: number }[];
  worst: { symbol: string; name: string | null; plPct: number }[];
};

export function computePortfolioAnalytics(rows: AnalyticsRow[], fx: PortfolioFxRates, base: string, unknownSector: string): PortfolioAnalyticsData {
  const conv = (v: number | null, from: string) =>
    v == null ? null : convertPortfolioMoney(v, from, base, fx);

  let totalValue = 0;
  let totalCost = 0;
  let totalIncome = 0;
  let unconverted = 0;
  const holdings: { symbol: string; name: string | null; value: number }[] = [];
  const sectorMap = new Map<string, number>();
  const sectorSources = new Map<string, SectorCompanySource[]>();
  const movers: { symbol: string; name: string | null; plPct: number }[] = [];

  for (const r of rows) {
    const mvBase = conv(r.mv, r.holdingCcy);
    const costBase = conv(r.cost, r.holdingCcy);
    const incomeBase = conv(r.estAnnual, r.holdingCcy);
    if (mvBase == null) unconverted++;
    if (mvBase != null) {
      totalValue += mvBase;
      holdings.push({ symbol: r.symbol, name: r.name, value: mvBase });
      const sector = r.sector ?? unknownSector;
      sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + mvBase);
      const source: SectorCompanySource = {
        symbol: r.symbol,
        name: r.name,
        value: mvBase,
        cost: costBase,
        pl: conv(r.pl, r.holdingCcy),
        dayChangePct: r.dayChangePct,
      };
      const sources = sectorSources.get(sector);
      if (sources) sources.push(source);
      else sectorSources.set(sector, [source]);
    }
    if (mvBase != null && costBase != null) totalCost += costBase;
    if (incomeBase != null && incomeBase > 0) totalIncome += incomeBase;
    if (r.cost > 0 && r.pl != null && mvBase != null) {
      movers.push({ symbol: r.symbol, name: r.name, plPct: (r.pl / r.cost) * 100 });
    }
  }

  const totalPl = totalValue - totalCost;
  const totalPlPct = totalCost > 0 ? (totalPl / totalCost) * 100 : null;
  const portfolioYield = totalValue > 0 ? (totalIncome / totalValue) * 100 : null;

  holdings.sort((x, y) => y.value - x.value);
  const unknownLabel = unknownSector;
  const sectors = [...sectorMap.entries()]
    .map(([name, value]) => ({
      name,
      value,
      companies: groupSectorCompanies(sectorSources.get(name) ?? []),
    }))
    .sort((x, y) => y.value - x.value);
  const hasRealSectors = sectors.some((s) => s.name !== unknownLabel);
  movers.sort((x, y) => y.plPct - x.plPct);

  return {
    base,
    totalValue,
    totalCost,
    totalPl,
    totalPlPct,
    totalIncome,
    portfolioYield,
    unconverted,
    holdings,
    sectors,
    hasRealSectors,
    best: movers.slice(0, 3),
    worst: movers.slice(-3).reverse(),
  };
}
