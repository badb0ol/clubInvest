
import { Club, Member, Asset, Transaction, NavEntry, PortfolioSummary, Currency } from '../types';
import { fetchAssetPrice, convertCurrency } from './financeEngine';

// --- UTILS ---

export const generateInviteCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// --- CORE FINANCIAL CALCULATIONS ---

export const calculatePortfolioState = (
  club: Club,
  assets: Asset[],
  prices: Record<string, number>
): PortfolioSummary => {
  let totalAssetValueEur = 0;
  let totalCostBasisEur = 0;

  assets.forEach((asset) => {
    const currentPrice = prices[asset.ticker] || asset.avg_buy_price; 
    
    // Convert current value to Club Currency (EUR)
    const assetValueNative = asset.quantity * currentPrice;
    const assetValueEur = convertCurrency(assetValueNative, asset.currency, club.currency);
    
    // Convert cost basis to Club Currency
    const costBasisNative = asset.quantity * asset.avg_buy_price;
    const costBasisEur = convertCurrency(costBasisNative, asset.currency, club.currency);

    totalAssetValueEur += assetValueEur;
    totalCostBasisEur += costBasisEur;
  });

  // TRUE NAV Calculation:
  // Net Assets = (Liquid Assets + Cash) - Liabilities (Taxes Owed)
  const totalNetAssets = (totalAssetValueEur + club.cash_balance) - club.tax_liability;
  
  // NAV Per Share: Net Assets / Shares
  const navPerShare = club.total_shares > 0 
    ? totalNetAssets / club.total_shares 
    : 100; // Default Starting NAV

  const totalLatentPL = totalAssetValueEur - totalCostBasisEur;
  
  // Mock variation logic
  const dayVariationPercent = totalCostBasisEur > 0 
    ? (totalLatentPL / totalCostBasisEur) * 100 
    : 0;

  return {
    totalNetAssets: parseFloat(totalNetAssets.toFixed(2)),
    navPerShare: parseFloat(navPerShare.toFixed(4)),
    totalLatentPL: parseFloat(totalLatentPL.toFixed(2)),
    dayVariationPercent: parseFloat(dayVariationPercent.toFixed(2)),
    totalShares: club.total_shares,
    totalTaxLiability: club.tax_liability,
    cashBalance: club.cash_balance
  };
};

// --- ACTION LOGIC (The 5 Requirements) ---

/**
 * A. SAISIR UN DÉPÔT
 * @returns Updated [Club, Member, Transaction]
 */
export const executeDeposit = (
  club: Club,
  member: Member,
  amount: number,
  currentNav: number
) => {
  const sharesCreated = amount / currentNav;

  const updatedClub = {
    ...club,
    cash_balance: club.cash_balance + amount,
    total_shares: club.total_shares + sharesCreated
  };

  const updatedMember = {
    ...member,
    shares_owned: member.shares_owned + sharesCreated,
    total_invested_fiat: member.total_invested_fiat + amount
  };

  // REMOVED user_name to match DB Schema
  const transaction: Transaction = {
    id: crypto.randomUUID(),
    club_id: club.id,
    user_id: member.user_id,
    type: 'DEPOSIT',
    amount_fiat: amount,
    shares_change: sharesCreated,
    created_at: new Date().toISOString()
  };

  return { updatedClub, updatedMember, transaction };
};

/**
 * B. PASSER UN ORDRE (BUY)
 * @returns Updated [Club, Asset, Transaction]
 */
export const executeBuyOrder = (
  club: Club,
  assets: Asset[],
  ticker: string,
  qty: number,
  pricePerShare: number,
  currency: Currency,
  adminUser: Member
) => {
  // 1. Calculate Cost
  const costNative = pricePerShare * qty;
  const costClubCurrency = convertCurrency(costNative, currency, club.currency);

  // 2. Strict Fund Check
  if (club.cash_balance < costClubCurrency) {
    const missing = costClubCurrency - club.cash_balance;
    throw new Error(`Fonds insuffisants. Requis: ${costClubCurrency.toFixed(2)} ${club.currency}, Disponible: ${club.cash_balance.toFixed(2)} ${club.currency}. Manque: ${missing.toFixed(2)} ${club.currency}`);
  }

  // 3. Update Club Cash
  const updatedClub = {
    ...club,
    cash_balance: club.cash_balance - costClubCurrency
  };

  // 4. Update/Create Asset
  let updatedAssets = [...assets];
  const existingAssetIndex = updatedAssets.findIndex(a => a.ticker === ticker);

  if (existingAssetIndex >= 0) {
    const asset = updatedAssets[existingAssetIndex];
    // Weighted Average Price Calculation
    const totalValueOld = asset.quantity * asset.avg_buy_price;
    const totalValueNew = costNative;
    const newQty = asset.quantity + qty;
    const newAvgPrice = (totalValueOld + totalValueNew) / newQty;

    updatedAssets[existingAssetIndex] = {
      ...asset,
      quantity: newQty,
      avg_buy_price: newAvgPrice
    };
  } else {
    updatedAssets.push({
      id: crypto.randomUUID(),
      club_id: club.id,
      ticker,
      quantity: qty,
      avg_buy_price: pricePerShare,
      currency
    });
  }

  // 5. Create Transaction Log
  // REMOVED user_name to match DB Schema
  const transaction: Transaction = {
    id: crypto.randomUUID(),
    club_id: club.id,
    user_id: adminUser.user_id,
    type: 'BUY',
    amount_fiat: costClubCurrency, // Recorded in Club Currency
    asset_ticker: ticker,
    price_at_transaction: pricePerShare,
    shares_change: 0,
    created_at: new Date().toISOString()
  };

  return { updatedClub, updatedAssets, transaction };
};

/**
 * EXECUTE SELL ORDER with 31.4% Tax Liability Calculation
 */
export const executeSellOrder = (
  club: Club,
  assets: Asset[],
  ticker: string,
  qty: number,
  pricePerShare: number,
  currency: Currency,
  adminUser: Member
) => {
    // 1. Check Ownership
    const assetIndex = assets.findIndex(a => a.ticker === ticker);
    if (assetIndex === -1 || assets[assetIndex].quantity < qty) {
        throw new Error(`Actifs insuffisants. Détenu: ${assetIndex === -1 ? 0 : assets[assetIndex].quantity}, Vente: ${qty}`);
    }

    // 2. Calculate Revenue & Gains
    const revenueNative = pricePerShare * qty;
    const revenueClubCurrency = convertCurrency(revenueNative, currency, club.currency);
    
    // Cost Basis Calculation for Gains
    const asset = assets[assetIndex];
    const costBasisNative = asset.avg_buy_price * qty;
    const costBasisEur = convertCurrency(costBasisNative, asset.currency, club.currency);
    
    // Realized Gain (Plus-value)
    const realizedGain = revenueClubCurrency - costBasisEur;

    // 3. Calculate Tax Liability (31.4% Flat Tax) if there is a gain
    let taxAmount = 0;
    if (realizedGain > 0) {
        taxAmount = realizedGain * 0.314;
    }

    // 4. Update Club Cash and Tax Liability
    const updatedClub = {
        ...club,
        cash_balance: club.cash_balance + revenueClubCurrency,
        tax_liability: club.tax_liability + taxAmount
    };

    // 5. Update Asset
    let updatedAssets = [...assets];
    const newQty = asset.quantity - qty;

    if (newQty <= 0) {
        updatedAssets.splice(assetIndex, 1); // Remove if sold out
    } else {
        updatedAssets[assetIndex] = { ...asset, quantity: newQty };
    }

    // 6. Create Transaction Log
    // REMOVED user_name to match DB Schema
    const transaction: Transaction = {
        id: crypto.randomUUID(),
        club_id: club.id,
        user_id: adminUser.user_id,
        type: 'SELL',
        amount_fiat: revenueClubCurrency,
        asset_ticker: ticker,
        price_at_transaction: pricePerShare,
        realized_gain: realizedGain,
        shares_change: 0,
        created_at: new Date().toISOString()
    };

    return { updatedClub, updatedAssets, transaction };
};

/**
 * C. EFFECTUER UN RETRAIT with French PFU Tax Estimation
 * @returns Updated [Club, Member, Transaction]
 */
export const executeWithdrawal = (
  club: Club,
  member: Member,
  amount: number,
  currentNav: number
) => {
  if (club.cash_balance < amount) {
    throw new Error("Trésorerie insuffisante pour ce retrait.");
  }

  const sharesToBurn = amount / currentNav;

  if (member.shares_owned < sharesToBurn) {
    throw new Error(`Utilisateur ne possède que ${member.shares_owned.toFixed(2)} parts. Le retrait nécessite ${sharesToBurn.toFixed(2)} parts.`);
  }

  // --- FRENCH TAX LOGIC (Simulated) ---
  const memberPRU = member.total_invested_fiat / member.shares_owned;
  const capitalPortion = sharesToBurn * memberPRU;
  const gainPortion = amount - capitalPortion;
  
  // Tax is on the gain
  const taxEstimate = gainPortion > 0 ? gainPortion * 0.30 : 0;

  const updatedClub = {
    ...club,
    cash_balance: club.cash_balance - amount,
    total_shares: club.total_shares - sharesToBurn,
    // FIX: Add estimated tax to the club's liability immediately
    tax_liability: club.tax_liability + taxEstimate
  };

  const updatedMember = {
    ...member,
    shares_owned: member.shares_owned - sharesToBurn
  };

  // REMOVED user_name to match DB Schema
  const transaction: Transaction = {
    id: crypto.randomUUID(),
    club_id: club.id,
    user_id: member.user_id,
    type: 'WITHDRAWAL',
    amount_fiat: amount,
    shares_change: -sharesToBurn,
    tax_estimate: taxEstimate,
    created_at: new Date().toISOString()
  };

  return { updatedClub, updatedMember, transaction };
};

/**
 * D. FIGER LA NAV (Snapshot)
 */
export const createNavSnapshot = (
  clubId: string,
  portfolioSummary: PortfolioSummary
): NavEntry => {
  return {
    id: crypto.randomUUID(),
    club_id: clubId,
    date: new Date().toISOString().split('T')[0],
    nav_per_share: portfolioSummary.navPerShare,
    total_net_assets: portfolioSummary.totalNetAssets
  };
};
