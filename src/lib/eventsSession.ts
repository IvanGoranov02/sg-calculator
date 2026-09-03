/** Initial portfolioReady: guests need no fetch; loading/authenticated must wait. */
export function initialPortfolioReady(sessionStatus: string): boolean {
  return sessionStatus === "unauthenticated";
}
