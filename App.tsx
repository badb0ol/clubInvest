import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip, XAxis, CartesianGrid } from 'recharts';
import { Club, Member, Asset, Transaction, NavEntry, PortfolioSummary } from './types';
import { fetchAssetPrice, convertCurrency } from './services/financeEngine';
import { generateInviteCode, calculatePortfolioState, executeDeposit, executeBuyOrder, executeSellOrder, executeWithdrawal, createNavSnapshot } from './services/ClubManager';
import { analyzePortfolioDistribution } from './services/geminiService';
import { Card, Button, Input, Badge, Modal, Table, TableRow, TableCell, Logo, Icon } from './components/ui';
import { supabase } from './lib/supabaseClient';
import { Session } from '@supabase/supabase-js';

// --- CONSTANTS ---

const AVAILABLE_BANKS = [
    { id: 'bourso', name: 'BoursoBank', logo: 'B' },
    { id: 'tr', name: 'Trade Republic', logo: 'T' },
    { id: 'fortuneo', name: 'Fortuneo', logo: 'F' },
    { id: 'ibkr', name: 'Interactive Brokers', logo: 'I' },
];

type TimeRange = '1J' | '1S' | '1M' | '1A' | 'MAX';
//
type ViewState = 'landing' | 'auth' | 'onboarding' | 'dashboard' | 'portfolio' | 'members' | 'journal' | 'admin';
// --- SUB-COMPONENTS ---

// 1. AUTH SCREEN
const AuthScreen: React.FC<{ onAuthSuccess: () => void }> = ({ onAuthSuccess }) => {
    const [isLogin, setIsLogin] = useState(true);
    
    // Login State
    const [loginIdentifier, setLoginIdentifier] = useState(''); // Email or Username

    // Signup State
    const [signupEmail, setSignupEmail] = useState('');
    const [signupUsername, setSignupUsername] = useState('');
    
    // Shared State
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAuth = async () => {
        setLoading(true);
        setError(null);
        try {
            if (isLogin) {
                let emailToUse = loginIdentifier.trim();
                
                // If input does not contain '@', assume it is a username and look it up
                if (!emailToUse.includes('@')) {
                    const { data: profile, error: profileError } = await supabase
                        .from('profiles')
                        .select('email')
                        .eq('full_name', emailToUse) // Mapping username to full_name as per schema
                        .single();
                    
                    if (profileError || !profile) {
                        throw new Error("Nom d'utilisateur introuvable.");
                    }
                    emailToUse = profile.email;
                }

                const { error } = await supabase.auth.signInWithPassword({ email: emailToUse, password });
                if (error) throw error;
            } else {
                // Sign Up
                const { data, error } = await supabase.auth.signUp({ 
                    email: signupEmail, 
                    password,
                    options: { data: { full_name: signupUsername } } 
                });
                if (error) throw error;
                
                // Create Profile Row
                if (data.user) {
                    await supabase.from('profiles').insert({
                        id: data.user.id,
                        email: signupEmail,
                        full_name: signupUsername
                    });
                }
            }
            onAuthSuccess();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-black p-4 transition-colors duration-500">
            <div className="mb-10 scale-125">
                <Logo className="justify-center" />
            </div>
            <Card className="w-full max-w-md space-y-6">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                        {isLogin ? 'Bon retour parmi nous' : 'Créer un compte'}
                    </h1>
                    <p className="text-slate-500 text-sm mt-2">Connectez-vous pour accéder à votre club.</p>
                </div>
                {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}
                <div className="space-y-4">
                    {isLogin ? (
                        <Input 
                            type="text" 
                            placeholder="Email ou Nom d'utilisateur" 
                            value={loginIdentifier} 
                            onChange={e => setLoginIdentifier(e.target.value)} 
                        />
                    ) : (
                        <>
                            <Input 
                                type="text" 
                                placeholder="Nom d'utilisateur" 
                                value={signupUsername} 
                                onChange={e => setSignupUsername(e.target.value)} 
                            />
                            <Input 
                                type="email" 
                                placeholder="Email" 
                                value={signupEmail} 
                                onChange={e => setSignupEmail(e.target.value)} 
                            />
                        </>
                    )}
                    <Input 
                        type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} 
                    />
                    <Button className="w-full" onClick={handleAuth} disabled={loading}>
                        {loading ? 'Chargement...' : (isLogin ? 'Se connecter' : "S'inscrire")}
                    </Button>
                </div>
                <div className="text-center">
                    <button onClick={() => setIsLogin(!isLogin)} className="text-sm text-slate-400 hover:text-slate-900 dark:hover:text-white underline transition-colors">
                        {isLogin ? "Pas de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
                    </button>
                </div>
            </Card>
        </div>
    );
};

// 2. ONBOARDING SCREEN
const OnboardingScreen: React.FC<{ user: any, onClubJoined: () => void }> = ({ user, onClubJoined }) => {
    const [newClubName, setNewClubName] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleCreate = async () => {
        if (!newClubName) return;
        setIsLoading(true);
        try {
            const inviteCode = generateInviteCode();
            // 1. Create Club
            const { data: club, error: clubError } = await supabase.from('clubs').insert({
                name: newClubName,
                invite_code: inviteCode,
            }).select().single();
            if (clubError) throw clubError;

            // 2. Add Member (Admin) - Using Upsert to prevent duplicate errors if double clicked
            const { error: memberError } = await supabase.from('club_members').upsert({
                club_id: club.id,
                user_id: user.id,
                role: 'admin',
            }, { onConflict: 'club_id, user_id', ignoreDuplicates: true });
            
            if (memberError) throw memberError;

            onClubJoined();
        } catch (e: any) {
            console.error(e);
            alert("Erreur: " + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleJoin = async () => {
        if (!joinCode) return;
        setIsLoading(true);
        try {
            const { data: club, error } = await supabase.from('clubs').select('*').eq('invite_code', joinCode).single();
            if (error || !club) throw new Error("Code invalide ou club inexistant");

            const { error: joinError } = await supabase.from('club_members').insert({
            club_id: club.id,
            user_id: user.id,
            role: 'member'
        });

        if (joinError) {
            if (joinError.code === '23505') throw new Error("Vous êtes déjà membre de ce club !");
            throw joinError;
        }

        onClubJoined();
    } catch (e: any) {
        alert(e.message);
    } finally {
        setIsLoading(false);
    }
};

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-black p-6 transition-colors duration-500">
            <div className="absolute top-8 left-8">
                <button 
                    onClick={() => supabase.auth.signOut()} 
                    className="text-gray-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-2 transition-all font-medium"
                >
                    <span>←</span> Déconnexion
                </button>
            </div>

            <div className="text-center mb-8">
                <p className="text-gray-500 text-sm uppercase tracking-widest mb-2">Compte actif</p>
                <p className="text-xl font-medium text-slate-900 dark:text-white">{user?.email}</p>
            </div>
            <div className="max-w-4xl w-full grid md:grid-cols-2 gap-12 items-center">
                <Card className="space-y-6">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white text-center">Créer un Club</h2>
                    <Input placeholder="Nom du Club" value={newClubName} onChange={e => setNewClubName(e.target.value)} />
                    <Button className="w-full" onClick={handleCreate} disabled={isLoading}>Créer le Club</Button>
                </Card>
                <div className="space-y-6 p-6 text-center">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Rejoindre un Club</h2>
                    <Input 
                        placeholder="CODE" className="text-center font-mono text-2xl tracking-widest uppercase"
                        maxLength={6} value={joinCode} onChange={e => setJoinCode(e.target.value)}
                    />
                    <Button variant="outline" className="w-full" onClick={handleJoin} disabled={isLoading}>Rejoindre</Button>
                </div>
            </div>
        </div>
    );
};

// --- MAIN APP ---

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [activeClub, setActiveClub] = useState<Club | null>(null);
  const [currentUserMember, setCurrentUserMember] = useState<Member | null>(null);
  
  // Loading States
  const [loadingSession, setLoadingSession] = useState(true);
  const [checkingMembership, setCheckingMembership] = useState(false);
  
  // isLoading State
  const [isLoading, setIsLoading] = useState(false);

  // App Data
  const [members, setMembers] = useState<Member[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [navHistory, setNavHistory] = useState<NavEntry[]>([]);
  const [assetPrices, setAssetPrices] = useState<Record<string, number>>({});
  
  // UI State
  const [view, setView] = useState<ViewState>('landing');
  const [darkMode, setDarkMode] = useState(true); 
  const [modal, setModal] = useState<{ type: string | null }>({ type: null });
  const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>('BUY');
  const [chartRange, setChartRange] = useState<TimeRange>('1M');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedAssetHistory, setSelectedAssetHistory] = useState<string | null>(null);
  const [isConnectingBank, setIsConnectingBank] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [helpTopic, setHelpTopic] = useState<string | null>(null);

  // 0. DARK MODE & TUTORIAL EFFECT
  useEffect(() => {
    if (darkMode) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
      // Check if user has seen tutorial
      const hasSeen = localStorage.getItem('hasSeenTutorial');
      if (!hasSeen && session && activeClub) {
          setShowTutorial(true);
      }
  }, [session, activeClub]);

  const closeTutorial = () => {
      setShowTutorial(false);
      localStorage.setItem('hasSeenTutorial', 'true');
  };

  // 1. SESSION INIT & MEMBERSHIP CHECK
  useEffect(() => {
    const initApp = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setLoadingSession(false);
        if (session) {
            fetchClubContext(session.user.id);
        }
    };

    initApp();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
          fetchClubContext(session.user.id);
      } else {
          setActiveClub(null);
          setCurrentUserMember(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. FETCH CLUB CONTEXT (Strict 1 Club Rule)
  const fetchClubContext = async (userId: string) => {
      setCheckingMembership(true);
      try {
          // Fetch the first club found (Strict Rule: One club per user)
          const { data: memberShips } = await supabase
            .from('club_members')
            .select('*, clubs(*)')
            .eq('user_id', userId)
            .limit(1); // Enforce checking for single club
          
          if (memberShips && memberShips.length > 0) {
              const membership = memberShips[0];
              const club = membership.clubs;
              const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', userId).single();
              
              setActiveClub(club);
              setCurrentUserMember({ ...membership, full_name: profile?.full_name || 'Moi' });
              await loadClubData(club.id);
          } else {
              // Not a member of any club -> Send to Landing/Onboarding
              setActiveClub(null);
              setCurrentUserMember(null);
          }
      } catch (e) {
          console.error("Error fetching context:", e);
      } finally {
          setCheckingMembership(false);
      }
  };

  const loadClubData = async (clubId: string) => {
      const { data: m } = await supabase.from('club_members').select('*, profiles(full_name)').eq('club_id', clubId);
      const formattedMembers = m?.map((item: any) => ({
          ...item,
          full_name: item.profiles?.full_name || 'Inconnu'
      })) || [];
      setMembers(formattedMembers);

      const { data: a } = await supabase.from('assets').select('*').eq('club_id', clubId);
      setAssets(a || []);

      const { data: t } = await supabase.from('transactions').select('*').eq('club_id', clubId).order('created_at', { ascending: false });
      setTransactions(t || []);

      const { data: n } = await supabase.from('nav_history').select('*').eq('club_id', clubId).order('date', { ascending: true });
      setNavHistory(n || []);
  };

  // 3. REAL TIME PRICES
  useEffect(() => {
    if (!activeClub || assets.length === 0) return;
    const fetchPrices = async () => {
      const newPrices: Record<string, number> = {};
      for (const asset of assets) {
        newPrices[asset.ticker] = await fetchAssetPrice(asset.ticker);
      }
      setAssetPrices(prev => ({ ...prev, ...newPrices }));
    };
    fetchPrices();
    const interval = setInterval(fetchPrices, 300000); // 5m refresh interval for free plan API call
    return () => clearInterval(interval);
  }, [activeClub, assets]);

  // --- ENGINE ---
  const portfolioSummary = useMemo(() => {
    if (!activeClub) return {
        totalNetAssets: 0, navPerShare: 100, totalLatentPL: 0, dayVariationPercent: 0, totalShares: 0, totalTaxLiability: 0, cashBalance: 0
    };
    return calculatePortfolioState(activeClub, assets, assetPrices);
  }, [activeClub, assets, assetPrices]);
    
  // Définition de la variable pour savoir si l'utilisateur actuel est Admin
  const isAdmin = currentUserMember?.role === 'admin';
  
  const filteredHistory = useMemo(() => {
    if(!activeClub) return [];
    
    // Create live point
    const livePoint: NavEntry = {
        id: 'live', club_id: activeClub.id, date: new Date().toISOString(),
        nav_per_share: portfolioSummary.navPerShare,
        total_net_assets: portfolioSummary.totalNetAssets
    };
    
    // Sort logic
    const allData = [...navHistory, livePoint].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Filter Logic
    const now = new Date();
    let cutoff = new Date(0); // MAX

    if (chartRange === '1J') cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    if (chartRange === '1S') cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (chartRange === '1M') cutoff = new Date(now.setMonth(now.getMonth() - 1));
    if (chartRange === '1A') cutoff = new Date(now.setFullYear(now.getFullYear() - 1));

    return allData.filter(d => new Date(d.date) >= cutoff);
  }, [navHistory, chartRange, portfolioSummary]);

  // --- HANDLERS ---
  
{/*  const handleManualAddMember = async (name: string, email: string) => {
    if (!activeClub) return;
    const fakeId = crypto.randomUUID(); 
    await supabase.from('profiles').insert({ id: fakeId, full_name: name, email: email });
    await supabase.from('club_members').insert({ club_id: activeClub.id, user_id: fakeId, role: 'member' });
    await loadClubData(activeClub.id);
    setModal({ type: null });
  }; */}

const handleDeposit = async (memberId: string, amountStr: string) => {
    if (!activeClub || !session) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return alert("Montant invalide");

    const currentNav = portfolioSummary.navPerShare || 100; // Sécurité si NAV = 0
    setIsLoading(true);

    try {
        if (memberId === 'ALL') {
            const sharesPerPerson = amount / currentNav;
            const totalCashDelta = amount * members.length;
            const totalSharesDelta = sharesPerPerson * members.length;

            // 1. Préparer les updates de CHAQUE membre
            const memberUpdates = members.map(m => 
                supabase.from('club_members').update({
                    shares_owned: m.shares_owned + sharesPerPerson,
                    total_invested_fiat: m.total_invested_fiat + amount
                }).eq('id', m.id)
            );

            // 2. Envoyer tout en parallèle
            await Promise.all([
                supabase.from('clubs').update({
                    cash_balance: activeClub.cash_balance + totalCashDelta,
                    total_shares: activeClub.total_shares + totalSharesDelta
                }).eq('id', activeClub.id),
                
                supabase.from('transactions').insert(members.map(m => ({
                    club_id: activeClub.id,
                    user_id: m.user_id,
                    type: 'DEPOSIT',
                    amount_fiat: amount,
                    shares_change: sharesPerPerson
                }))),

                ...memberUpdates
            ]);
            alert("Dépôt collectif validé !");
        } else {
            // Logique individuelle (similaire mais pour un seul ID)
            // ... (ton code actuel pour un membre seul)
        }
        await loadClubData(activeClub.id);
        setModal({ type: null });
    } catch (e: any) {
        alert("Erreur dépôt : " + e.message);
    } finally {
        setIsLoading(false);
    }
};

  const handleTrade = async (ticker: string, qtyStr: string, priceStr: string) => {
      setErrorMsg(null);
      if (!activeClub || !currentUserMember) return;
      const qty = parseFloat(qtyStr);
      const price = parseFloat(priceStr);
      
      try {
          const result = tradeType === 'BUY' 
            ? executeBuyOrder(activeClub, assets, ticker, qty, price, 'USD', currentUserMember)
            : executeSellOrder(activeClub, assets, ticker, qty, price, 'USD', currentUserMember);
          
          await supabase.from('transactions').insert(result.transaction);
          await supabase.from('clubs').update({ cash_balance: result.updatedClub.cash_balance, tax_liability: result.updatedClub.tax_liability }).eq('id', activeClub.id);
          
          for (const a of result.updatedAssets) {
             await supabase.from('assets').upsert(a);
          }
          const currentTickers = result.updatedAssets.map(a => a.ticker);
          const toDelete = assets.filter(a => !currentTickers.includes(a.ticker));
          for (const d of toDelete) await supabase.from('assets').delete().eq('id', d.id);

          setActiveClub(result.updatedClub);
          await loadClubData(activeClub.id);
          setModal({ type: null });
      } catch (e: any) {
          setErrorMsg(e.message);
      }
  };

  const handleFreeze = async () => {
      if (!activeClub) return;
      try {
          const entry = createNavSnapshot(activeClub.id, portfolioSummary);
          const { error } = await supabase.from('nav_history').insert(entry);
          if (error) throw error;
          await loadClubData(activeClub.id);
          alert("Quote-part figée avec succès !");
      } catch(e: any) {
          alert("Erreur lors de l'instantané : " + e.message);
      }
  };

  const handleAi = async () => {
      setIsAnalyzing(true);
      const res = await analyzePortfolioDistribution(assets.map(a => a.ticker));
      setAiInsight(res);
      setIsAnalyzing(false);
  };

  const handleKickMember = async (memberId: string) => {
    if (!activeClub) return;
    
    // 1. Vérifier si on ne s'auto-supprime pas (sécurité)
    const memberToKick = members.find(m => m.id === memberId);
    if (memberToKick?.user_id === session?.user.id) {
        return alert("Tu ne peux pas te virer toi-même !");
    }

    if (!confirm("Es-tu sûr de vouloir retirer ce membre du club ?")) return;

    try {
        const { error } = await supabase
            .from('club_members')
            .delete()
            .eq('id', memberId);

        if (error) throw error;

        // Mettre à jour l'affichage local
        setMembers(members.filter(m => m.id !== memberId));
        alert("Membre retiré avec succès.");
    } catch (e: any) {
        alert("Erreur : " + e.message);
        }
    };

  const handleConnectBank = (name: string) => {
      setIsConnectingBank(true);
      setTimeout(async () => {
          if (activeClub) {
              await supabase.from('clubs').update({ linked_bank: name }).eq('id', activeClub.id);
              setActiveClub({ ...activeClub, linked_bank: name });
          }
          setIsConnectingBank(false);
          setModal({ type: null });
      }, 1500);
  };

  // --- RENDERING ROUTER ---

  // 1. Loading Supabase Session
  if (loadingSession) return <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-black text-slate-900 dark:text-white">Chargement...</div>;

  // 2. Not Authenticated
  if (!session) return <AuthScreen onAuthSuccess={() => {}} />;

  // 3. Authenticated but checking if user belongs to a club
  if (checkingMembership) return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-50 dark:bg-black p-4">
        <div className="w-12 h-12 border-4 border-slate-200 dark:border-slate-800 border-t-slate-900 dark:border-t-white rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-medium animate-pulse">Vérification de l'adhésion...</p>
    </div>
  );

  //
    // 4. ÉCRAN D'ACCUEIL (Landing Page - Design Apple Dark)
    if (view === 'landing') {
    return (
        <div className="h-screen bg-black flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-700">
        <div className="w-24 h-24 bg-white rounded-full mb-10 flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.1)]">
            <Icon name="pie" className="w-10 h-10 text-black" />
        </div>
        <h1 className="text-6xl md:text-8xl font-black text-white tracking-tighter mb-6">
            ClubInvest
        </h1>
        <p className="text-gray-400 max-w-sm mb-12 text-lg leading-relaxed">
            Le système d'exploitation minimaliste pour les clubs d'investissement modernes.
            <br/><span className="text-gray-600 text-sm">Suivez la performance. Gérez les membres. Calculez la Quote-part.</span>
        </p>
        <button 
            onClick={() => {
                // Si pas de session -> Login
                if (!session) {
                setView('auth');
                } 
                // Si session mais pas de club -> Créer/Rejoindre
                else if (!activeClub) {
                setView('onboarding');
                } 
                // Si session + club -> Dashboard
                else {
                setView('dashboard');
                }
            }}
            className="bg-white text-black px-12 py-4 rounded-full font-bold text-lg hover:scale-105 transition-transform"
            >
            Lancer l'App →
        </button>
        </div>
    );
    }

    // 5. ÉCRAN DE CONNEXION (Stylisé)
    if (view === 'auth' && !session) {
    return (
        <div className="h-screen bg-black flex flex-col items-center justify-center p-6">
        <AuthScreen onAuthSuccess={() => setView('onboarding')} />
        <button onClick={() => setView('landing')} className="mt-8 text-gray-500 hover:text-white transition-colors">Retour à l'accueil</button>
        </div>
    );
    }

    // 6. Authenticated, No Club Found -> Show Onboarding
    if (!activeClub) return <OnboardingScreen user={session.user} onClubJoined={() => fetchClubContext(session.user.id)} />;
  // 5. Authenticated & Member -> Show Dashboard (Strict Mode)
  // Sidebar & Menu Logic included in return below

  // --- DASHBOARD LAYOUT ---

  const menuItems = [
      { id: 'dashboard', label: 'Tableau de Bord', icon: 'dashboard' },
      { id: 'portfolio', label: 'Portefeuille', icon: 'pie' },
      { id: 'members', label: 'Membres', icon: 'users' },
      { id: 'journal', label: 'Journal', icon: 'book' },
  ];

  return (
    <div className="font-sans transition-colors duration-500 min-h-screen bg-slate-50 dark:bg-black text-slate-900 dark:text-slate-100 md:flex">
        
        {/* ONBOARDING / TUTORIAL */}
        {showTutorial && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                <Card className="max-w-md w-full p-8 space-y-6 relative border-0 shadow-2xl">
                     <div className="flex justify-between items-center">
                         <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Bienvenue sur ClubInvest ! 🚀</h3>
                     </div>
                     <p className="text-slate-600 dark:text-slate-300">
                         Voici un tour rapide de votre nouvel outil de gestion de club d'investissement.
                     </p>
                     <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                         <li className="flex gap-3"><span className="bg-slate-100 dark:bg-slate-800 p-1 rounded">📊</span> <span><b>Tableau de Bord :</b> Suivez la valeur de votre part (Quote-part) et vos performances.</span></li>
                         <li className="flex gap-3"><span className="bg-slate-100 dark:bg-slate-800 p-1 rounded">⚡️</span> <span><b>Actions :</b> Achetez, vendez ou déposez du cash instantanément.</span></li>
                         <li className="flex gap-3"><span className="bg-slate-100 dark:bg-slate-800 p-1 rounded">💼</span> <span><b>Portefeuille :</b> Visualisez vos actifs en temps réel.</span></li>
                     </ul>
                     <Button onClick={closeTutorial} className="w-full h-12 text-lg">C'est parti !</Button>
                </Card>
            </div>
        )}

        {/* HELP MODAL */}
        {helpTopic && (
             <Modal isOpen={true} onClose={() => setHelpTopic(null)} title="Aide">
                 <div className="text-slate-600 dark:text-slate-300 space-y-4">
                     {helpTopic === 'nav' && <p>La <b>Quote-part</b> représente la valeur d'une part du club. Elle est calculée en divisant l'Actif Net Total par le nombre de parts émises. C'est l'indicateur principal de performance.</p>}
                     {helpTopic === 'actions' && <p>Utilisez ces boutons pour interagir avec le club. <b>Acheter/Vendre</b> pour gérer le portefeuille, <b>Dépôt</b> pour ajouter du cash, et <b>Coach IA</b> pour obtenir des conseils.</p>}
                 </div>
             </Modal>
        )}

        {/* SIDEBAR (DESKTOP) */}
        <aside className="hidden md:flex w-72 fixed top-0 bottom-0 z-30 flex-col justify-between border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-black">
          <div className="p-10">
              <div className="mb-12 pl-2">
                <Logo className="w-auto h-8" onClick={() => setView('dashboard')} />
              </div>
              <nav className="space-y-2">
                  {menuItems.map(item => (
                      <button 
                        key={item.id}
                        onClick={() => setView(item.id as any)}
                        className={`w-full text-left px-4 py-3 text-sm font-semibold transition-all flex items-center gap-4 rounded-xl ${view === item.id ? 'bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
                      >
                          <Icon name={item.icon as any} className="w-5 h-5" />
                          {item.label}
                      </button>
                  ))}
                  {currentUserMember?.role === 'admin' && (
                     <button onClick={() => setView('admin')} className={`w-full text-left px-4 py-3 text-sm font-semibold transition-all flex items-center gap-4 rounded-xl mt-8 ${view === 'admin' ? 'bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}>
                         <Icon name="settings" className="w-5 h-5" />
                         Admin
                     </button>
                  )}
              </nav>
          </div>
          <div className="p-10">
             <button onClick={() => setDarkMode(!darkMode)} className="mb-6 flex items-center gap-3 text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
                <Icon name={darkMode ? 'sun' : 'moon'} className="w-5 h-5" />
                {darkMode ? 'Mode Clair' : 'Mode Sombre'}
             </button>
             <button onClick={() => supabase.auth.signOut()} className="text-red-500 text-sm font-bold hover:text-red-600 transition-colors">Se Déconnecter</button>
          </div>
        </aside>

        {/* MOBILE TOP HEADER */}
        <header className="md:hidden fixed top-0 w-full z-40 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 p-4 flex justify-between items-center transition-colors">
            <Logo className="w-auto h-8" onClick={() => setView('dashboard')} />
            <div className="flex items-center gap-3">
                <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <Icon name={darkMode ? 'sun' : 'moon'} className="w-5 h-5 text-slate-900 dark:text-white" />
                </button>
                <button onClick={() => supabase.auth.signOut()} className="p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-500">
                    <Icon name="logout" className="w-5 h-5" />
                </button>
            </div>
        </header>

        {/* MOBILE BOTTOM NAV */}
        <nav className="md:hidden fixed bottom-0 w-full z-50 bg-white/90 dark:bg-black/90 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 pb-safe transition-colors">
            <div className="flex justify-around items-center p-2">
                {menuItems.map(item => (
                    <button 
                        key={item.id}
                        onClick={() => setView(item.id as any)}
                        className={`flex flex-col items-center justify-center p-2 rounded-xl w-full transition-all ${view === item.id ? 'text-slate-900 dark:text-white scale-105' : 'text-slate-400 dark:text-slate-600'}`}
                    >
                        <Icon name={item.icon as any} className={`w-6 h-6 mb-1 ${view === item.id ? 'stroke-[2.5px]' : ''}`} />
                        <span className="text-[10px] font-bold">{item.label}</span>
                    </button>
                ))}
                {currentUserMember?.role === 'admin' && (
                     <button onClick={() => setView('admin')} className={`flex flex-col items-center justify-center p-2 rounded-xl w-full transition-all ${view === 'admin' ? 'text-slate-900 dark:text-white scale-105' : 'text-slate-400 dark:text-slate-600'}`}>
                        <Icon name="settings" className="w-6 h-6 mb-1" />
                        <span className="text-[10px] font-bold">Admin</span>
                    </button>
                )}
            </div>
        </nav>

        {/* MAIN CONTENT */}
        <main className="flex-1 md:ml-72 pt-24 md:pt-12 p-6 md:p-12 overflow-y-auto min-h-screen pb-32 md:pb-12 scroll-smooth">
            <div className="max-w-6xl mx-auto space-y-8 md:space-y-12">
                
                {/* Desktop Header */}
                <header className="flex justify-between items-center hidden md:flex">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                            {activeClub.name}
                            {activeClub.linked_bank && <Badge type="neutral">{activeClub.linked_bank}</Badge>}
                        </h2>
                        <p className="text-slate-400 text-xs font-mono mt-1">CODE: {activeClub.invite_code}</p>
                    </div>
                </header>

                {/* DASHBOARD VIEW */}
                {view === 'dashboard' && (
                    <>
                        {/* Net Assets & Actions */}
                        <div className="flex flex-col xl:flex-row justify-between items-center xl:items-end gap-8">
                            <div className="text-center xl:text-left space-y-2">
                                <p className="text-slate-500 dark:text-slate-400 uppercase text-xs font-bold tracking-widest flex items-center gap-2 justify-center xl:justify-start">
                                    Actif Net (Quote-part Global)
                                </p>
                                <h1 className="text-5xl md:text-7xl font-black text-slate-900 dark:text-white leading-none tracking-tight">
                                    {portfolioSummary.totalNetAssets.toLocaleString('fr-FR', { style: 'currency', currency: activeClub.currency })}
                                </h1>
                            </div>
                            
                            {/* Actions - REORDERED: 2x2 Grid */}
                            <div className="w-full xl:w-96 relative group">
                                <button onClick={() => setHelpTopic('actions')} className="absolute -top-6 right-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs flex items-center gap-1">
                                    <span className="w-4 h-4 rounded-full border flex items-center justify-center border-current">?</span> Aide
                                </button>
                                <div className="grid grid-cols-2 gap-3">
                                    {/* ROW 1: Buy | Sell */}
                                    <Button onClick={() => { setModal({ type: 'trade' }); setTradeType('BUY'); }} variant="success" className="justify-center h-14 w-full text-base">Acheter</Button>
                                    <Button onClick={() => { setModal({ type: 'trade' }); setTradeType('SELL'); }} variant="danger" className="justify-center h-14 w-full text-base">Vendre</Button>
                                    
                                    {/* ROW 2: Deposit | AI */}
                                    <Button onClick={() => setModal({ type: 'deposit' })} variant="secondary" className="justify-center h-14 w-full text-base"><Icon name="plus" /> Dépôt</Button>
                                    <Button onClick={handleAi} disabled={isAnalyzing} variant="outline" className="justify-center h-14 w-full text-base">Coach IA</Button>
                                </div>
                            </div>
                        </div>

                        {/* Stats Row */}
                        <div className="flex flex-wrap justify-center md:justify-start gap-4 md:gap-8 pb-6 border-b border-slate-200 dark:border-slate-800">
                             <Badge type={portfolioSummary.dayVariationPercent >= 0 ? 'positive' : 'negative'}>{portfolioSummary.dayVariationPercent > 0 ? '+' : ''}{portfolioSummary.dayVariationPercent}% 24h</Badge>
                             <span className="text-slate-500 dark:text-slate-400 text-sm font-bold">Quote-part : {portfolioSummary.navPerShare.toFixed(2)}</span>
                             {portfolioSummary.totalTaxLiability > 0 && <span className="text-red-500 text-sm font-bold">Impôts (Est.) : {portfolioSummary.totalTaxLiability.toFixed(2)}</span>}
                        </div>

                        {/* AI Insight */}
                        {aiInsight && (
                            <div className="animate-in fade-in slide-in-from-top-4 duration-500 p-6 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-900 dark:text-indigo-200 rounded-2xl text-sm border border-indigo-100 dark:border-indigo-800/50 shadow-sm">
                                <div className="flex gap-3">
                                    <div className="shrink-0 pt-0.5">✨</div>
                                    <p>{aiInsight}</p>
                                </div>
                            </div>
                        )}

                        {/* Chart */}
                        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-sm relative">
                             <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">Quote Part</h3>
                                    <button onClick={() => setHelpTopic('nav')} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                        <span className="w-4 h-4 rounded-full border flex items-center justify-center border-current text-[10px]">?</span>
                                    </button>
                                </div>
                                <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                                    {['1J', '1S', '1M', '1A', 'MAX'].map(r => (
                                        <button 
                                            key={r}
                                            onClick={() => setChartRange(r as TimeRange)}
                                            className={`text-xs font-bold px-3 py-1.5 rounded-md transition-all ${chartRange === r ? 'bg-white dark:bg-slate-600 shadow-sm text-slate-900 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                                        >
                                            {r}
                                        </button>
                                    ))}
                                </div>
                             </div>
                             
                             <div className="h-[250px] md:h-[350px] w-full">
                                <ResponsiveContainer>
                                    <AreaChart data={filteredHistory}>
                                        <defs>
                                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={darkMode ? 0.1 : 0.8} />
                                        <XAxis 
                                            dataKey="date" 
                                            tickLine={true} 
                                            axisLine={false} 
                                            tick={{fontSize: 10, fill: darkMode ? '#94a3b8' : '#64748b'}} 
                                            tickFormatter={(val) => {
                                                const d = new Date(val);
                                                return `${d.getDate()}/${d.getMonth()+1}`;
                                            }}
                                            interval="preserveStartEnd"
                                        />
                                        <YAxis 
                                            hide={false}
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{fontSize: 10, fill: darkMode ? '#94a3b8' : '#64748b'}}
                                            domain={['dataMin', 'dataMax']} // Dynamic domain to show variations
                                            width={35}
                                        />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: darkMode ? '#000' : '#fff', borderRadius: '12px', border: '1px solid #333' }} 
                                            itemStyle={{ color: darkMode ? '#fff' : '#000' }}
                                            labelStyle={{ color: '#9ca3af' }}
                                            labelFormatter={(l) => new Date(l).toLocaleDateString()}
                                            formatter={(value: number) => [`${value.toFixed(2)}`, 'Nav']}
                                        />
                                        <Area type="monotone" dataKey="nav_per_share" stroke="#10b981" fill="url(#colorValue)" strokeWidth={3} activeDot={{r: 6, fill: '#10b981'}} />
                                    </AreaChart>
                                </ResponsiveContainer>
                             </div>
                        </div>
                    </>
                )}

                {/* PORTFOLIO VIEW */}
                {view === 'portfolio' && (
                    <Card className="p-0 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                            <h3 className="font-bold text-slate-900 dark:text-white">Vos Actifs</h3>
                            {!activeClub.linked_bank && <Button variant="outline" className="text-xs px-3 py-2" onClick={() => setModal({ type: 'connectBank' })}>+ Banque</Button>}
                        </div>

                        {/* Mobile List View */}
                        <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                             <div className="p-4 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                <div>
                                    <div className="font-bold text-emerald-500">LIQUIDITÉS</div>
                                    <div className="text-xs text-slate-500">Cash disponible</div>
                                </div>
                                <div className="text-right">
                                    <div className="font-mono font-bold">{activeClub.cash_balance.toFixed(2)} €</div>
                                </div>
                             </div>
                             {assets.map(a => {
                                const price = assetPrices[a.ticker] || a.avg_buy_price;
                                const val = a.quantity * price * (a.currency === 'USD' ? 0.95 : 1);
                                const pl = ((price - a.avg_buy_price) / a.avg_buy_price) * 100;
                                return (
                                    <div key={a.id} className="p-4 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" onClick={() => setSelectedAssetHistory(a.ticker)}>
                                        <div>
                                            <div className="font-bold text-slate-900 dark:text-white text-lg">{a.ticker}</div>
                                            <div className="text-xs text-slate-500">{a.quantity.toFixed(4)} parts</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-mono font-bold text-slate-900 dark:text-white">{val.toFixed(2)} €</div>
                                            <div className={`text-xs font-bold ${pl >= 0 ? 'text-green-500' : 'text-red-500'}`}>{pl > 0 ? '+' : ''}{pl.toFixed(2)}%</div>
                                        </div>
                                    </div>
                                )
                             })}
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden md:block">
                            <Table headers={['Actif', 'Qté', 'Prix Moyen', 'Prix Actuel', 'Valeur', '+/-']}>
                                <TableRow>
                                    <TableCell><div className="font-bold text-emerald-500">LIQUIDITÉS</div></TableCell>
                                    <TableCell>-</TableCell>
                                    <TableCell>-</TableCell>
                                    <TableCell>-</TableCell>
                                    <TableCell>{activeClub.cash_balance.toFixed(2)} €</TableCell>
                                    <TableCell><Badge>CASH</Badge></TableCell>
                                </TableRow>
                                {assets.map(a => {
                                    const price = assetPrices[a.ticker] || a.avg_buy_price;
                                    const val = a.quantity * price * (a.currency === 'USD' ? 0.95 : 1);
                                    const pl = ((price - a.avg_buy_price) / a.avg_buy_price) * 100;
                                    return (
                                        <TableRow key={a.id} onClick={() => setSelectedAssetHistory(a.ticker)}>
                                            <TableCell><span className="font-bold bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">{a.ticker}</span></TableCell>
                                            <TableCell>{a.quantity.toFixed(4)}</TableCell>
                                            <TableCell>{a.avg_buy_price.toFixed(2)}</TableCell>
                                            <TableCell className="font-bold">{price.toFixed(2)}</TableCell>
                                            <TableCell>{val.toFixed(2)} €</TableCell>
                                            <TableCell><Badge type={pl >= 0 ? 'positive' : 'negative'}>{pl > 0 ? '+' : ''}{pl.toFixed(2)}%</Badge></TableCell>
                                        </TableRow>
                                    );
                                })}
                            </Table>
                        </div>
                    </Card>
                )}

{/* MEMBERS VIEW */}
{view === 'members' && (
    <>
        <div className="flex justify-end mb-4">
            <Button onClick={() => setModal({ type: 'addMember' })}>+ Membre</Button>
        </div>
        
        <Card className="p-0 overflow-hidden bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            {/* 1. Mobile List (Optimisée pour iPhone) */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                {members.map(m => (
                    <div key={m.id} className="p-4 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-400">
                                {m.full_name?.charAt(0) || '?'}
                            </div>
                            <div>
                                <div className="font-bold text-slate-900 dark:text-white leading-tight">
                                    {m.full_name || 'Sans nom'}
                                </div>
                                <div className="mt-1">
                                    <Badge type="neutral">{m.role}</Badge>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                            <div className="text-right">
                                <div className="text-sm font-bold text-slate-900 dark:text-white">
                                    {m.shares_owned.toFixed(2)} parts
                                </div>
                                <div className="text-xs text-slate-500">
                                    Inv: {m.total_invested_fiat.toFixed(0)}€
                                </div>
                            </div>

                            {/* Bouton Kick Mobile */}
                            {isAdmin && m.user_id !== session?.user.id && (
                                <button 
                                    onClick={() => handleKickMember(m.id)}
                                    className="p-2 text-red-500 bg-red-50 dark:bg-red-900/20 rounded-full active:scale-90 transition-transform"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* 2. Desktop Table */}
            <div className="hidden md:block">
                {/* Ajout d'une colonne vide dans les headers pour le bouton Kick */}
                <Table headers={['Nom', 'Rôle', 'Parts', 'Investi Total', 'Actions']}>
                    {members.map(m => (
                        <TableRow key={m.id}>
                            <TableCell>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-xs">
                                        {m.full_name?.charAt(0) || '?'}
                                    </div>
                                    <span className="font-medium">{m.full_name || 'Membre'}</span>
                                </div>
                            </TableCell>
                            <TableCell><Badge>{m.role}</Badge></TableCell>
                            <TableCell className="font-mono">{m.shares_owned.toFixed(2)}</TableCell>
                            <TableCell>{m.total_invested_fiat.toFixed(2)} €</TableCell>
                            
                            <TableCell className="text-right">
                                {isAdmin && m.user_id !== session?.user.id && (
                                    <button 
                                        onClick={() => handleKickMember(m.id)}
                                        className="text-red-500 hover:bg-red-900/20 p-1.5 rounded-full transition-colors"
                                        title="Retirer du club"
                                    >
                                        ✕
                                    </button>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </Table>
            </div>
        </Card>
    </>
)}

                {/* JOURNAL VIEW */}
                {view === 'journal' && (
                    <Card className="p-0 overflow-hidden">
                        {/* Mobile List */}
                        <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                            {transactions.map(t => (
                                <div key={t.id} className="p-4 flex justify-between items-center">
                                    <div>
                                        <Badge type={t.type === 'DEPOSIT' || t.type === 'SELL' ? 'positive' : 'neutral'}>{t.type}</Badge>
                                        <div className="text-xs text-slate-500 mt-1">{t.created_at.split('T')[0]}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-slate-900 dark:text-white">
                                            {t.asset_ticker ? t.asset_ticker : (t.type === 'DEPOSIT' || t.type === 'WITHDRAWAL' ? 'CASH' : '-')}
                                        </div>
                                        <div className="text-sm">{t.amount_fiat.toFixed(2)} €</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop Table */}
                        <div className="hidden md:block">
                            <Table headers={['Date', 'Type', 'Détails', 'Montant']}>
                                {transactions.map(t => (
                                    <TableRow key={t.id}>
                                        <TableCell>{t.created_at.split('T')[0]}</TableCell>
                                        <TableCell><Badge>{t.type}</Badge></TableCell>
                                        <TableCell>{t.asset_ticker ? `${t.asset_ticker} @ ${t.price_at_transaction}` : `${t.shares_change?.toFixed(2)} parts`}</TableCell>
                                        <TableCell>{t.amount_fiat.toFixed(2)}</TableCell>
                                    </TableRow>
                                ))}
                            </Table>
                        </div>
                    </Card>
                )}

                 {/* ADMIN VIEW */}
                 {view === 'admin' && (
                    <Card>
                        <h3 className="font-bold mb-4 text-slate-900 dark:text-white">Administration</h3>
                        <div className="flex flex-col gap-4">
                            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                                <p className="text-sm text-slate-500 mb-1">Code d'invitation</p>
                                <span className="font-mono text-xl font-bold tracking-widest">{activeClub.invite_code}</span>
                            </div>
                            <Button onClick={handleFreeze}>Figer la Quote-part</Button>
                        </div>
                    </Card>
                )}
            </div>
        </main>

        {/* MODALS 
        {modal.type === 'addMember' && (
            <Modal isOpen={true} onClose={() => setModal({type:null})} title="Ajouter Membre">
                <div className="space-y-4">
                    <Input id="newMemName" placeholder="Nom" />
                    <Input id="newMemEmail" placeholder="Email" />
                    <Button onClick={() => {
                        const name = (document.getElementById('newMemName') as HTMLInputElement).value;
                        const email = (document.getElementById('newMemEmail') as HTMLInputElement).value;
                        handleManualAddMember(name, email);
                    }}>Ajouter</Button>
                </div>
            </Modal>
        )}*/}

        {modal.type === 'deposit' && (
            <Modal isOpen={true} onClose={() => setModal({type:null})} title="Dépôt">
                <div className="space-y-4">
                    <select id="depMember" className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border-none outline-none" defaultValue="">
                        <option value="" disabled>Sélectionner un membre</option>
                        <option value="ALL" className="font-bold">👥 Tous les membres</option>
                        {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                    </select>
                    <Input id="depAmount" type="number" placeholder="Montant EUR (par personne)" />
                    <Button onClick={() => {
                        const mid = (document.getElementById('depMember') as HTMLSelectElement).value;
                        const amt = (document.getElementById('depAmount') as HTMLInputElement).value;
                        handleDeposit(mid, amt);
                    }}>Confirmer</Button>
                </div>
            </Modal>
        )}

        {modal.type === 'trade' && (
            <Modal isOpen={true} onClose={() => setModal({type:null})} title={tradeType}>
                 <div className="space-y-4">
                    {errorMsg && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg font-medium">{errorMsg}</div>}
                    <Input id="trTicker" placeholder="Ticker (ex: NVDA, MSFT)" />
                    <Input id="trQty" type="number" placeholder="Quantité" />
                    <Input id="trPrice" type="number" placeholder="Prix Unitaire" />
                    <Button variant={tradeType === 'BUY' ? 'success' : 'danger'} onClick={() => {
                        const t = (document.getElementById('trTicker') as HTMLInputElement).value;
                        const q = (document.getElementById('trQty') as HTMLInputElement).value;
                        const p = (document.getElementById('trPrice') as HTMLInputElement).value;
                        handleTrade(t, q, p);
                    }}>Exécuter</Button>
                </div>
            </Modal>
        )}

        {modal.type === 'connectBank' && (
             <Modal isOpen={true} onClose={() => setModal({type:null})} title="Banques">
                 <div className="grid grid-cols-2 gap-4">
                     {AVAILABLE_BANKS.map(b => (
                         <button key={b.id} onClick={() => handleConnectBank(b.name)} className="p-4 border border-slate-200 dark:border-slate-700 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 flex flex-col items-center transition-all active:scale-95">
                             <span className="text-2xl font-bold mb-2">{b.logo}</span>
                             <span className="text-sm font-medium">{b.name}</span>
                         </button>
                     ))}
                 </div>
                 {isConnectingBank && <p className="text-center mt-4 text-sm text-slate-500 animate-pulse">Connexion sécurisée...</p>}
             </Modal>
        )}
    </div>
  );
}
