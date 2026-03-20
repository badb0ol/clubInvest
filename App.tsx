import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip, XAxis, CartesianGrid } from 'recharts';
import { Club, Member, Asset, Transaction, NavEntry, PortfolioSummary, Message } from './types';
import { fetchAssetPrice, convertCurrency } from './services/financeEngine';
import { generateInviteCode, calculatePortfolioState, executeBuyOrder, executeSellOrder, executeWithdrawal, createNavSnapshot } from './services/ClubManager';
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
type ViewState = 'landing' | 'auth' | 'onboarding' | 'dashboard' | 'portfolio' | 'members' | 'journal' | 'chat' | 'admin';
type ModalType = 'addMember' | 'deposit' | 'trade' | 'connectBank' | 'withdraw' | 'kickConfirm' | null;

// --- INLINE NOTIFICATION ---
const Notification: React.FC<{ message: string; type: 'success' | 'error'; onClose: () => void }> = ({ message, type, onClose }) => (
    <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl animate-in slide-in-from-top-4 duration-300 ${type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
        <span className="text-sm font-semibold">{message}</span>
        <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100 text-lg leading-none">×</button>
    </div>
);

// --- AUTH SCREEN ---
const AuthScreen: React.FC<{ onAuthSuccess: () => void; onBack: () => void }> = ({ onAuthSuccess, onBack }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [loginIdentifier, setLoginIdentifier] = useState('');
    const [signupEmail, setSignupEmail] = useState('');
    const [signupUsername, setSignupUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAuth = async () => {
        setLoading(true);
        setError(null);
        try {
            if (isLogin) {
                let emailToUse = loginIdentifier.trim();
                if (!emailToUse.includes('@')) {
                    const { data: profile, error: pError } = await supabase
                        .from('profiles')
                        .select('email')
                        .ilike('full_name', emailToUse)
                        .maybeSingle();
                    if (pError || !profile) throw new Error("Pseudo introuvable.");
                    emailToUse = profile.email;
                }
                const { error } = await supabase.auth.signInWithPassword({ email: emailToUse, password });
                if (error) throw error;
            } else {
                if (!signupUsername.trim()) throw new Error("Le pseudo est obligatoire.");
                if (!signupEmail.trim()) throw new Error("L'email est obligatoire.");
                if (password.length < 6) throw new Error("Le mot de passe doit faire au moins 6 caractères.");
                const { data, error } = await supabase.auth.signUp({ email: signupEmail, password });
                if (error) throw error;
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

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleAuth();
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-black p-4">
            <button onClick={onBack} className="absolute top-8 left-8 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors text-sm">
                ← Retour
            </button>
            <div className="mb-10 scale-125">
                <Logo className="justify-center" />
            </div>
            <Card className="w-full max-w-md space-y-6">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                        {isLogin ? 'Bon retour parmi nous' : 'Créer un compte'}
                    </h1>
                </div>
                {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl border border-red-100 dark:border-red-800">{error}</div>}
                <div className="space-y-3" onKeyDown={handleKeyDown}>
                    {isLogin ? (
                        <Input type="text" placeholder="Email ou Pseudo" value={loginIdentifier} onChange={e => setLoginIdentifier(e.target.value)} autoComplete="username" />
                    ) : (
                        <>
                            <Input type="text" placeholder="Pseudo de connexion" value={signupUsername} onChange={e => setSignupUsername(e.target.value)} />
                            <Input type="email" placeholder="Email" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} autoComplete="email" />
                        </>
                    )}
                    <Input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} autoComplete={isLogin ? 'current-password' : 'new-password'} />
                    <Button className="w-full" onClick={handleAuth} disabled={loading}>
                        {loading ? 'Chargement...' : (isLogin ? 'Se connecter' : "S'inscrire")}
                    </Button>
                </div>
                <div className="text-center">
                    <button onClick={() => { setIsLogin(!isLogin); setError(null); }} className="text-sm text-slate-400 hover:text-slate-900 dark:hover:text-white underline">
                        {isLogin ? "Pas de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
                    </button>
                </div>
            </Card>
        </div>
    );
};

// --- ONBOARDING SCREEN ---
const OnboardingScreen: React.FC<{ user: any; onClubJoined: () => void }> = ({ user, onClubJoined }) => {
    const [newClubName, setNewClubName] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isChecking, setIsChecking] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const check = async () => {
            setIsChecking(true);
            try {
                const { data } = await supabase
                    .from('club_members')
                    .select('*, clubs(*)')
                    .eq('user_id', user.id)
                    .maybeSingle();
                if (data && data.clubs) onClubJoined();
            } catch (e) {
                console.error("Erreur check:", e);
            } finally {
                setIsChecking(false);
            }
        };
        check();
    }, [user.id, onClubJoined]);

    const ensureProfileExists = async () => {
        await supabase.from('profiles').upsert({
            id: user.id,
            email: user.email,
            full_name: user.email?.split('@')[0] || 'Investisseur'
        }, { onConflict: 'id' });
    };

    const handleCreate = async () => {
        if (!newClubName.trim()) return;
        setIsLoading(true);
        setError(null);
        try {
            await ensureProfileExists();
            const inviteCode = generateInviteCode();
            const { data: club, error: ce } = await supabase.from('clubs')
                .insert({ name: newClubName, invite_code: inviteCode, cash_balance: 0, total_shares: 0, tax_liability: 0 })
                .select().single();
            if (ce) throw ce;
            await supabase.from('club_members').insert({
                club_id: club.id, user_id: user.id, role: 'admin', shares_owned: 0, total_invested_fiat: 0
            });
            onClubJoined();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleJoin = async () => {
        if (!joinCode.trim()) return;
        setIsLoading(true);
        setError(null);
        try {
            await ensureProfileExists();
            const { data: club } = await supabase.from('clubs').select('*').eq('invite_code', joinCode.toUpperCase()).single();
            if (!club) throw new Error("Code invalide. Vérifiez le code d'invitation.");
            await supabase.from('club_members').insert({
                club_id: club.id, user_id: user.id, role: 'member', shares_owned: 0, total_invested_fiat: 0
            });
            onClubJoined();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    if (isChecking) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-black">
                <div className="animate-pulse text-emerald-600 font-medium">Recherche de votre club...</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-black p-6">
            <div className="absolute top-8 left-8">
                <button onClick={() => supabase.auth.signOut()} className="text-gray-500 hover:text-black dark:hover:text-white transition-colors text-sm">← Déconnexion</button>
            </div>
            <div className="text-center mb-8">
                <Logo className="justify-center mb-4" />
                <p className="text-gray-500 text-sm">Bienvenue, <span className="font-semibold text-slate-900 dark:text-white">{user?.email}</span></p>
            </div>
            {error && <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl border border-red-100 dark:border-red-800 max-w-lg w-full text-center">{error}</div>}
            <div className="max-w-4xl w-full grid md:grid-cols-2 gap-8">
                <Card className="space-y-4">
                    <h2 className="text-xl font-bold dark:text-white text-center">Créer un Club</h2>
                    <p className="text-sm text-slate-500 text-center">Vous serez l'administrateur du club.</p>
                    <Input placeholder="Nom du Club" value={newClubName} onChange={e => setNewClubName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()} />
                    <Button className="w-full" onClick={handleCreate} disabled={isLoading || !newClubName.trim()}>
                        {isLoading ? 'Création...' : 'Créer'}
                    </Button>
                </Card>
                <Card className="space-y-4 text-center">
                    <h2 className="text-xl font-bold dark:text-white">Rejoindre un Club</h2>
                    <p className="text-sm text-slate-500">Entrez le code à 6 lettres donné par votre admin.</p>
                    <Input placeholder="CODE" className="text-center font-mono text-2xl uppercase tracking-widest" maxLength={6} value={joinCode} onChange={e => setJoinCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleJoin()} />
                    <Button variant="outline" className="w-full" onClick={handleJoin} disabled={isLoading || joinCode.length < 6}>
                        {isLoading ? 'Vérification...' : 'Rejoindre'}
                    </Button>
                </Card>
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
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingPrices, setIsFetchingPrices] = useState(false);

    // App Data
    const [members, setMembers] = useState<Member[]>([]);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [navHistory, setNavHistory] = useState<NavEntry[]>([]);
    const [assetPrices, setAssetPrices] = useState<Record<string, number>>({});

    // UI State
    const [view, setView] = useState<ViewState>('landing');
    const [darkMode, setDarkMode] = useState(true);
    const [modal, setModal] = useState<{ type: ModalType }>({ type: null });
    const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>('BUY');
    const [chartRange, setChartRange] = useState<TimeRange>('1M');
    const [aiInsight, setAiInsight] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [showTutorial, setShowTutorial] = useState(false);
    const [helpTopic, setHelpTopic] = useState<string | null>(null);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Modal-specific controlled state
    const [depositMemberId, setDepositMemberId] = useState('');
    const [depositAmount, setDepositAmount] = useState('');
    const [withdrawMemberId, setWithdrawMemberId] = useState('');
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [tradeTicker, setTradeTicker] = useState('');
    const [tradeQty, setTradeQty] = useState('');
    const [tradePrice, setTradePrice] = useState('');
    const [tradeCurrency, setTradeCurrency] = useState<'USD' | 'EUR'>('USD');
    const [tradeError, setTradeError] = useState<string | null>(null);
    const [depositError, setDepositError] = useState<string | null>(null);
    const [withdrawError, setWithdrawError] = useState<string | null>(null);
    const [addMemberEmail, setAddMemberEmail] = useState('');
    const [addMemberError, setAddMemberError] = useState<string | null>(null);
    const [memberToKick, setMemberToKick] = useState<Member | null>(null);
    const [isFetchingTradePrice, setIsFetchingTradePrice] = useState(false);
    const [freezeSuccess, setFreezeSuccess] = useState(false);

    // Chat state
    const [messages, setMessages] = useState<Message[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [isInvitingSending, setIsInvitingSending] = useState(false);

    // --- HELPERS ---
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const closeModal = () => {
        setModal({ type: null });
        setTradeError(null);
        setDepositError(null);
        setWithdrawError(null);
        setAddMemberError(null);
        setTradeTicker('');
        setTradeQty('');
        setTradePrice('');
        setDepositAmount('');
        setWithdrawAmount('');
        setDepositMemberId('');
        setWithdrawMemberId('');
        setAddMemberEmail('');
        setMemberToKick(null);
    };

    // --- DARK MODE ---
    useEffect(() => {
        document.documentElement.classList.toggle('dark', darkMode);
    }, [darkMode]);

    // --- TUTORIAL ---
    useEffect(() => {
        if (session && activeClub && !localStorage.getItem('hasSeenTutorial')) {
            setShowTutorial(true);
        }
    }, [session, activeClub]);

    const closeTutorial = () => {
        setShowTutorial(false);
        localStorage.setItem('hasSeenTutorial', 'true');
    };

    // --- SESSION INIT ---
    useEffect(() => {
        const initApp = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setSession(session);
            setLoadingSession(false);
            if (session) fetchClubContext(session.user.id);
        };
        initApp();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session) {
                fetchClubContext(session.user.id);
            } else {
                setActiveClub(null);
                setCurrentUserMember(null);
                setView('landing');
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    // --- FETCH CLUB CONTEXT ---
    const fetchClubContext = async (userId: string) => {
        setCheckingMembership(true);
        const { data: membership } = await supabase
            .from('club_members')
            .select('*, clubs(*), profiles(full_name)')
            .eq('user_id', userId)
            .maybeSingle();

        if (membership && membership.clubs) {
            setActiveClub(membership.clubs);
            setCurrentUserMember({
                ...membership,
                full_name: membership.profiles?.full_name || 'Utilisateur'
            });
            await loadClubData(membership.clubs.id);
            setView('dashboard');
        } else {
            setView('onboarding');
        }
        setCheckingMembership(false);
    };

    const loadClubData = async (clubId: string) => {
        const [
            { data: club },
            { data: m },
            { data: a },
            { data: t },
            { data: n }
        ] = await Promise.all([
            supabase.from('clubs').select('*').eq('id', clubId).single(),
            supabase.from('club_members').select('*, profiles(full_name)').eq('club_id', clubId),
            supabase.from('assets').select('*').eq('club_id', clubId),
            supabase.from('transactions').select('*').eq('club_id', clubId).order('created_at', { ascending: false }),
            supabase.from('nav_history').select('*').eq('club_id', clubId).order('date', { ascending: true }),
        ]);

        if (club) setActiveClub(club);
        setMembers(m?.map((item: any) => ({ ...item, full_name: item.profiles?.full_name || 'Inconnu' })) || []);
        setAssets(a || []);
        setTransactions(t || []);
        setNavHistory(n || []);
    };

    // --- LOAD MESSAGES ---
    const loadMessages = async (clubId: string) => {
        const { data } = await supabase
            .from('messages')
            .select('*')
            .eq('club_id', clubId)
            .order('created_at', { ascending: true })
            .limit(100);
        setMessages(data || []);
    };

    // --- REALTIME CHAT SUBSCRIPTION ---
    useEffect(() => {
        if (!activeClub) return;
        loadMessages(activeClub.id);

        const channel = supabase
            .channel(`messages:${activeClub.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `club_id=eq.${activeClub.id}`,
            }, (payload) => {
                setMessages(prev => [...prev, payload.new as Message]);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [activeClub?.id]);

    // --- REAL TIME PRICES (parallelized) ---
    useEffect(() => {
        if (!activeClub || assets.length === 0) return;
        const fetchPrices = async () => {
            setIsFetchingPrices(true);
            const results = await Promise.all(assets.map(a => fetchAssetPrice(a.ticker).then(price => ({ ticker: a.ticker, price }))));
            const newPrices: Record<string, number> = {};
            results.forEach(({ ticker, price }) => { newPrices[ticker] = price; });
            setAssetPrices(prev => ({ ...prev, ...newPrices }));
            setIsFetchingPrices(false);
        };
        fetchPrices();
        const interval = setInterval(fetchPrices, 300000);
        return () => clearInterval(interval);
    }, [activeClub, assets]);

    // --- ENGINE ---
    const portfolioSummary = useMemo(() => {
        if (!activeClub) return {
            totalNetAssets: 0, navPerShare: 100, totalLatentPL: 0, dayVariationPercent: 0, totalShares: 0, totalTaxLiability: 0, cashBalance: 0
        };
        return calculatePortfolioState(activeClub, assets, assetPrices);
    }, [activeClub, assets, assetPrices]);

    const isAdmin = currentUserMember?.role === 'admin';

    const filteredHistory = useMemo(() => {
        if (!activeClub) return [];
        const livePoint: NavEntry = {
            id: 'live', club_id: activeClub.id, date: new Date().toISOString(),
            nav_per_share: portfolioSummary.navPerShare,
            total_net_assets: portfolioSummary.totalNetAssets
        };
        const allData = [...navHistory, livePoint].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const now = new Date();
        let cutoff = new Date(0);
        if (chartRange === '1J') cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        if (chartRange === '1S') cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (chartRange === '1M') cutoff = new Date(new Date().setMonth(now.getMonth() - 1));
        if (chartRange === '1A') cutoff = new Date(new Date().setFullYear(now.getFullYear() - 1));
        return allData.filter(d => new Date(d.date) >= cutoff);
    }, [navHistory, chartRange, portfolioSummary, activeClub]);

    // --- HANDLERS ---

    const handleManualAddMember = async () => {
        if (!activeClub) return;
        setIsLoading(true);
        setAddMemberError(null);
        try {
            const memberEmail = addMemberEmail.trim();
            if (!memberEmail || !memberEmail.includes('@')) {
                throw new Error("Un email valide est obligatoire.");
            }
            const { data: profile, error: pErr } = await supabase
                .from('profiles')
                .select('id, full_name')
                .eq('email', memberEmail)
                .maybeSingle();
            if (pErr) throw pErr;
            if (!profile) throw new Error("Aucun compte trouvé pour cet email. Le membre doit d'abord s'inscrire.");
            const { error: cmErr } = await supabase.from('club_members').insert({
                club_id: activeClub.id,
                user_id: profile.id,
                role: 'member',
                shares_owned: 0,
                total_invested_fiat: 0
            });
            if (cmErr) throw cmErr;
            await loadClubData(activeClub.id);
            closeModal();
            notify(`${profile.full_name || memberEmail} ajouté au club.`);
        } catch (e: any) {
            setAddMemberError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeposit = async () => {
        const amount = parseFloat(depositAmount);
        if (!activeClub || isNaN(amount) || amount <= 0) {
            setDepositError("Montant invalide.");
            return;
        }
        if (!depositMemberId) {
            setDepositError("Sélectionnez un membre.");
            return;
        }
        setIsLoading(true);
        setDepositError(null);
        const currentNav = portfolioSummary.navPerShare || 100;
        const sharesToAdd = amount / currentNav;

        try {
            if (depositMemberId === 'ALL') {
                await Promise.all(members.map(async m => {
                    await supabase.from('club_members').update({
                        shares_owned: (Number(m.shares_owned) || 0) + sharesToAdd,
                        total_invested_fiat: (Number(m.total_invested_fiat) || 0) + amount
                    }).eq('id', m.id);
                    await supabase.from('transactions').insert({
                        club_id: activeClub.id,
                        user_id: m.user_id,
                        type: 'DEPOSIT',
                        amount_fiat: amount,
                        shares_change: sharesToAdd,
                        price_at_transaction: currentNav
                    });
                }));
                await supabase.from('clubs').update({
                    cash_balance: (Number(activeClub.cash_balance) || 0) + (amount * members.length),
                    total_shares: (Number(activeClub.total_shares) || 0) + (sharesToAdd * members.length)
                }).eq('id', activeClub.id);
            } else {
                const m = members.find(mem => mem.id === depositMemberId);
                if (!m) throw new Error("Membre introuvable.");
                await supabase.from('club_members').update({
                    shares_owned: (Number(m.shares_owned) || 0) + sharesToAdd,
                    total_invested_fiat: (Number(m.total_invested_fiat) || 0) + amount
                }).eq('id', m.id);
                await supabase.from('transactions').insert({
                    club_id: activeClub.id,
                    user_id: m.user_id,
                    type: 'DEPOSIT',
                    amount_fiat: amount,
                    shares_change: sharesToAdd,
                    price_at_transaction: currentNav
                });
                await supabase.from('clubs').update({
                    cash_balance: (Number(activeClub.cash_balance) || 0) + amount,
                    total_shares: (Number(activeClub.total_shares) || 0) + sharesToAdd
                }).eq('id', activeClub.id);
            }
            await loadClubData(activeClub.id);
            closeModal();
            notify(`Dépôt de ${amount.toFixed(2)} € enregistré.`);
        } catch (e: any) {
            setDepositError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleWithdraw = async () => {
        const amount = parseFloat(withdrawAmount);
        if (!activeClub || !currentUserMember || isNaN(amount) || amount <= 0) {
            setWithdrawError("Montant invalide.");
            return;
        }
        if (!withdrawMemberId) {
            setWithdrawError("Sélectionnez un membre.");
            return;
        }
        const m = members.find(mem => mem.id === withdrawMemberId);
        if (!m) { setWithdrawError("Membre introuvable."); return; }

        setIsLoading(true);
        setWithdrawError(null);
        try {
            const { updatedClub, updatedMember, transaction } = executeWithdrawal(
                activeClub, m, amount, portfolioSummary.navPerShare
            );
            await Promise.all([
                supabase.from('clubs').update({
                    cash_balance: updatedClub.cash_balance,
                    total_shares: updatedClub.total_shares,
                    tax_liability: updatedClub.tax_liability
                }).eq('id', activeClub.id),
                supabase.from('club_members').update({
                    shares_owned: updatedMember.shares_owned
                }).eq('id', m.id),
                supabase.from('transactions').insert({
                    club_id: transaction.club_id,
                    user_id: transaction.user_id,
                    type: transaction.type,
                    amount_fiat: transaction.amount_fiat,
                    shares_change: transaction.shares_change,
                    tax_estimate: transaction.tax_estimate
                })
            ]);
            await loadClubData(activeClub.id);
            closeModal();
            notify(`Retrait de ${amount.toFixed(2)} € enregistré.`);
        } catch (e: any) {
            setWithdrawError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleTrade = async () => {
        setTradeError(null);
        if (!activeClub || !currentUserMember) return;
        const qty = parseFloat(tradeQty);
        const price = parseFloat(tradePrice);
        if (isNaN(qty) || qty <= 0) { setTradeError("Quantité invalide."); return; }
        if (isNaN(price) || price <= 0) { setTradeError("Prix invalide."); return; }
        if (!tradeTicker.trim()) { setTradeError("Ticker obligatoire."); return; }

        setIsLoading(true);
        try {
            const result = tradeType === 'BUY'
                ? executeBuyOrder(activeClub, assets, tradeTicker.trim().toUpperCase(), qty, price, tradeCurrency, currentUserMember)
                : executeSellOrder(activeClub, assets, tradeTicker.trim().toUpperCase(), qty, price, tradeCurrency, currentUserMember);

            await supabase.from('transactions').insert({
                club_id: result.transaction.club_id,
                user_id: result.transaction.user_id,
                type: result.transaction.type,
                amount_fiat: result.transaction.amount_fiat,
                asset_ticker: result.transaction.asset_ticker,
                price_at_transaction: result.transaction.price_at_transaction,
                realized_gain: result.transaction.realized_gain,
                shares_change: result.transaction.shares_change,
            });
            await supabase.from('clubs').update({
                cash_balance: result.updatedClub.cash_balance,
                tax_liability: result.updatedClub.tax_liability
            }).eq('id', activeClub.id);

            // Upsert updated assets
            await Promise.all(result.updatedAssets.map(a => supabase.from('assets').upsert(a)));
            // Delete fully-sold positions
            const survivingTickers = new Set(result.updatedAssets.map(a => a.ticker));
            const toDelete = assets.filter(a => !survivingTickers.has(a.ticker));
            if (toDelete.length > 0) {
                await Promise.all(toDelete.map(d => supabase.from('assets').delete().eq('id', d.id)));
            }

            await loadClubData(activeClub.id);
            closeModal();
            notify(`${tradeType === 'BUY' ? 'Achat' : 'Vente'} de ${qty} ${tradeTicker.toUpperCase()} exécuté.`);
        } catch (e: any) {
            setTradeError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFreeze = async () => {
        if (!activeClub) return;
        setIsLoading(true);
        setFreezeSuccess(false);
        try {
            const entry = createNavSnapshot(activeClub.id, portfolioSummary);
            const { error } = await supabase.from('nav_history').insert(entry);
            if (error) throw error;
            await supabase.from('transactions').insert({
                club_id: activeClub.id,
                type: 'SNAPSHOT',
                amount_fiat: portfolioSummary.totalNetAssets,
                price_at_transaction: portfolioSummary.navPerShare,
                asset_ticker: 'SNAPSHOT'
            });
            await loadClubData(activeClub.id);
            setFreezeSuccess(true);
            notify("Quote-part figée avec succès !");
        } catch (e: any) {
            notify("Erreur : " + e.message, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAi = async () => {
        setIsAnalyzing(true);
        setAiInsight(null);
        const res = await analyzePortfolioDistribution(assets.map(a => a.ticker));
        setAiInsight(res);
        setIsAnalyzing(false);
    };

    const handleSendMessage = async (type: 'message' | 'announcement') => {
        if (!activeClub || !session || !chatInput.trim()) return;
        setIsSendingMessage(true);
        const { error } = await supabase.from('messages').insert({
            club_id: activeClub.id,
            user_id: session.user.id,
            content: chatInput.trim(),
            type,
        });
        if (error) notify("Erreur : " + error.message, 'error');
        else setChatInput('');
        setIsSendingMessage(false);
    };

    const handleSendInvite = async () => {
        if (!activeClub || !addMemberEmail.trim()) return;
        setIsInvitingSending(true);
        setAddMemberError(null);
        try {
            const { error } = await supabase.functions.invoke('send-invite', {
                body: {
                    to: addMemberEmail.trim(),
                    inviterName: currentUserMember?.full_name,
                    clubName: activeClub.name,
                    inviteCode: activeClub.invite_code,
                    appUrl: window.location.origin,
                },
            });
            if (error) throw error;
            closeModal();
            notify(`Invitation envoyée à ${addMemberEmail.trim()} !`);
        } catch (e: any) {
            setAddMemberError("Erreur lors de l'envoi : " + (e.message || 'inconnue'));
        } finally {
            setIsInvitingSending(false);
        }
    };

    const handleKickMember = async () => {
        if (!activeClub || !memberToKick) return;
        setIsLoading(true);
        try {
            const { error } = await supabase.from('club_members').delete().eq('id', memberToKick.id);
            if (error) throw error;
            setMembers(members.filter(m => m.id !== memberToKick.id));
            closeModal();
            notify(`${memberToKick.full_name} retiré du club.`);
        } catch (e: any) {
            notify("Erreur : " + e.message, 'error');
            closeModal();
        } finally {
            setIsLoading(false);
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
            closeModal();
            notify(`${name} connecté.`);
        }, 1200);
    };

    // Auto-scroll chat to bottom on new messages
    useEffect(() => {
        if (view === 'chat') {
            const el = document.getElementById('chat-messages');
            if (el) el.scrollTop = el.scrollHeight;
        }
    }, [messages, view]);

    // Auto-fetch price when ticker changes in trade modal
    useEffect(() => {
        if (!tradeTicker || tradeTicker.length < 1) return;
        const timeout = setTimeout(async () => {
            setIsFetchingTradePrice(true);
            const price = await fetchAssetPrice(tradeTicker.trim().toUpperCase());
            if (price > 0) setTradePrice(price.toFixed(2));
            setIsFetchingTradePrice(false);
        }, 800);
        return () => clearTimeout(timeout);
    }, [tradeTicker]);

    const [isConnectingBank, setIsConnectingBank] = useState(false);

    // --- RENDERING ---

    if (loadingSession) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-black text-slate-900 dark:text-white">
                <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-800 border-t-slate-900 dark:border-t-white rounded-full animate-spin"></div>
            </div>
        );
    }

    if (view === 'landing') {
        return (
            <div className="h-screen bg-black flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-700">
                <div className="w-24 h-24 bg-white rounded-full mb-10 flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                    <Icon name="pie" className="w-10 h-10 text-black" />
                </div>
                <h1 className="text-6xl md:text-8xl font-black text-white tracking-tighter mb-6">ClubInvest</h1>
                <p className="text-gray-400 max-w-sm mb-12 text-lg leading-relaxed">
                    Le système d'exploitation minimaliste pour les clubs d'investissement modernes.
                    <br /><span className="text-gray-600 text-sm">Suivez la performance. Gérez les membres. Calculez la Quote-part.</span>
                </p>
                <button
                    onClick={() => {
                        if (!session) setView('auth');
                        else if (!activeClub) setView('onboarding');
                        else setView('dashboard');
                    }}
                    className="bg-white text-black px-12 py-4 rounded-full font-bold text-lg hover:scale-105 transition-transform"
                >
                    Lancer l'App →
                </button>
            </div>
        );
    }

    if (!session) {
        return <AuthScreen onAuthSuccess={() => { }} onBack={() => setView('landing')} />;
    }

    if (checkingMembership) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-50 dark:bg-black p-4">
                <div className="w-12 h-12 border-4 border-slate-200 dark:border-slate-800 border-t-slate-900 dark:border-t-white rounded-full animate-spin mb-4"></div>
                <p className="text-slate-500 font-medium animate-pulse">Vérification de l'adhésion...</p>
            </div>
        );
    }

    if (!activeClub) {
        return <OnboardingScreen user={session.user} onClubJoined={() => fetchClubContext(session.user.id)} />;
    }

    // --- DASHBOARD LAYOUT ---

    const menuItems = [
        { id: 'dashboard', label: 'Tableau de Bord', icon: 'dashboard' },
        { id: 'portfolio', label: 'Portefeuille', icon: 'pie' },
        { id: 'members', label: 'Membres', icon: 'users' },
        { id: 'journal', label: 'Journal', icon: 'book' },
        { id: 'chat', label: 'Chat', icon: 'chat' },
    ];

    // Per-member portfolio value
    const memberValues = useMemo(() => {
        const nav = portfolioSummary.navPerShare;
        return members.reduce((acc, m) => {
            acc[m.id] = m.shares_owned * nav;
            return acc;
        }, {} as Record<string, number>);
    }, [members, portfolioSummary.navPerShare]);

    return (
        <div className="font-sans transition-colors duration-500 min-h-screen bg-slate-50 dark:bg-black text-slate-900 dark:text-slate-100 md:flex">

            {/* NOTIFICATION */}
            {notification && (
                <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />
            )}

            {/* TUTORIAL */}
            {showTutorial && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <Card className="max-w-md w-full p-8 space-y-6 relative border-0 shadow-2xl">
                        <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Bienvenue sur ClubInvest !</h3>
                        <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                            <li className="flex gap-3"><span className="bg-slate-100 dark:bg-slate-800 p-1 rounded">📊</span><span><b>Tableau de Bord :</b> Suivez la valeur de votre part (Quote-part) et vos performances.</span></li>
                            <li className="flex gap-3"><span className="bg-slate-100 dark:bg-slate-800 p-1 rounded">⚡</span><span><b>Actions :</b> Achetez, vendez, déposez ou retirez du cash.</span></li>
                            <li className="flex gap-3"><span className="bg-slate-100 dark:bg-slate-800 p-1 rounded">💼</span><span><b>Portefeuille :</b> Visualisez vos actifs en temps réel.</span></li>
                            <li className="flex gap-3"><span className="bg-slate-100 dark:bg-slate-800 p-1 rounded">🤖</span><span><b>Coach IA :</b> Analysez votre diversification avec Gemini.</span></li>
                        </ul>
                        <Button onClick={closeTutorial} className="w-full h-12 text-lg">C'est parti !</Button>
                    </Card>
                </div>
            )}

            {/* HELP MODAL */}
            {helpTopic && (
                <Modal isOpen={true} onClose={() => setHelpTopic(null)} title="Aide">
                    <div className="text-slate-600 dark:text-slate-300 space-y-4 text-sm leading-relaxed">
                        {helpTopic === 'nav' && <p>La <b>Quote-part</b> représente la valeur d'une part du club. Elle est calculée en divisant l'Actif Net Total par le nombre de parts émises. C'est l'indicateur principal de performance.</p>}
                        {helpTopic === 'actions' && <p>Utilisez ces boutons pour interagir avec le club. <b>Acheter/Vendre</b> pour gérer le portefeuille, <b>Dépôt</b> pour ajouter du cash, <b>Retrait</b> pour retirer des fonds, et <b>Coach IA</b> pour obtenir une analyse Gemini.</p>}
                        {helpTopic === 'pl' && <p>Le <b>P&L Total</b> représente la plus-value ou moins-value latente sur l'ensemble de vos positions, exprimée en pourcentage de votre prix d'achat moyen.</p>}
                    </div>
                </Modal>
            )}

            {/* SIDEBAR (DESKTOP) */}
            <aside className="hidden md:flex w-72 fixed top-0 bottom-0 z-30 flex-col justify-between border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-black">
                <div className="p-10">
                    <div className="mb-12 pl-2">
                        <Logo className="w-auto h-8" onClick={() => setView('dashboard')} />
                    </div>
                    <nav className="space-y-1">
                        {menuItems.map(item => (
                            <button
                                key={item.id}
                                onClick={() => setView(item.id as ViewState)}
                                className={`w-full text-left px-4 py-3 text-sm font-semibold transition-all flex items-center gap-4 rounded-xl ${view === item.id ? 'bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
                            >
                                <Icon name={item.icon as any} className="w-5 h-5" />
                                {item.label}
                            </button>
                        ))}
                        {isAdmin && (
                            <button onClick={() => setView('admin')} className={`w-full text-left px-4 py-3 text-sm font-semibold transition-all flex items-center gap-4 rounded-xl mt-6 ${view === 'admin' ? 'bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}>
                                <Icon name="settings" className="w-5 h-5" />
                                Admin
                            </button>
                        )}
                    </nav>
                </div>
                <div className="p-10 space-y-4">
                    <div className="text-xs text-slate-400 dark:text-slate-600 font-mono truncate">{currentUserMember?.full_name}</div>
                    <button onClick={() => setDarkMode(!darkMode)} className="flex items-center gap-3 text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
                        <Icon name={darkMode ? 'sun' : 'moon'} className="w-5 h-5" />
                        {darkMode ? 'Mode Clair' : 'Mode Sombre'}
                    </button>
                    <button onClick={() => supabase.auth.signOut()} className="text-red-500 text-sm font-bold hover:text-red-600 transition-colors flex items-center gap-2">
                        <Icon name="logout" className="w-4 h-4" />
                        Se Déconnecter
                    </button>
                </div>
            </aside>

            {/* MOBILE TOP HEADER */}
            <header className="md:hidden fixed top-0 w-full z-40 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 p-4 flex justify-between items-center">
                <Logo className="w-auto h-8" onClick={() => setView('dashboard')} />
                <div className="flex items-center gap-2">
                    <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <Icon name={darkMode ? 'sun' : 'moon'} className="w-5 h-5" />
                    </button>
                    <button onClick={() => supabase.auth.signOut()} className="p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-500">
                        <Icon name="logout" className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* MOBILE BOTTOM NAV */}
            <nav className="md:hidden fixed bottom-0 w-full z-50 bg-white/90 dark:bg-black/90 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 pb-safe">
                <div className="flex justify-around items-center p-2">
                    {menuItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => setView(item.id as ViewState)}
                            className={`flex flex-col items-center justify-center p-2 rounded-xl w-full transition-all ${view === item.id ? 'text-slate-900 dark:text-white scale-105' : 'text-slate-400 dark:text-slate-600'}`}
                        >
                            <Icon name={item.icon as any} className={`w-6 h-6 mb-1 ${view === item.id ? 'stroke-[2.5px]' : ''}`} />
                            <span className="text-[10px] font-bold">{item.label.split(' ')[0]}</span>
                        </button>
                    ))}
                    {isAdmin && (
                        <button onClick={() => setView('admin')} className={`flex flex-col items-center justify-center p-2 rounded-xl w-full transition-all ${view === 'admin' ? 'text-slate-900 dark:text-white scale-105' : 'text-slate-400 dark:text-slate-600'}`}>
                            <Icon name="settings" className="w-6 h-6 mb-1" />
                            <span className="text-[10px] font-bold">Admin</span>
                        </button>
                    )}
                </div>
            </nav>

            {/* MAIN CONTENT */}
            <main className="flex-1 md:ml-72 pt-24 md:pt-12 p-6 md:p-12 overflow-y-auto min-h-screen pb-32 md:pb-12">
                <div className="max-w-6xl mx-auto space-y-8 md:space-y-12">

                    {/* Desktop Header */}
                    <header className="hidden md:flex justify-between items-center">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                                {activeClub.name}
                                {activeClub.linked_bank && <Badge type="neutral">{activeClub.linked_bank}</Badge>}
                            </h2>
                            <p className="text-slate-400 text-xs font-mono mt-1">CODE: {activeClub.invite_code}</p>
                        </div>
                        {isFetchingPrices && (
                            <span className="text-xs text-slate-400 animate-pulse flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                Mise à jour des prix...
                            </span>
                        )}
                    </header>

                    {/* DASHBOARD VIEW */}
                    {view === 'dashboard' && (
                        <>
                            <div className="flex flex-col xl:flex-row justify-between items-center xl:items-end gap-8">
                                <div className="text-center xl:text-left space-y-2">
                                    <p className="text-slate-500 dark:text-slate-400 uppercase text-xs font-bold tracking-widest">Actif Net Total</p>
                                    <h1 className="text-5xl md:text-7xl font-black text-slate-900 dark:text-white leading-none tracking-tight">
                                        {portfolioSummary.totalNetAssets.toLocaleString('fr-FR', { style: 'currency', currency: activeClub.currency })}
                                    </h1>
                                    <p className="text-slate-500 text-sm">
                                        Quote-part : <span className="font-bold text-slate-900 dark:text-white">{portfolioSummary.navPerShare.toFixed(2)} {activeClub.currency}</span>
                                    </p>
                                </div>

                                {/* Actions - 2x2 grid + withdraw */}
                                <div className="w-full xl:w-auto relative group">
                                    <button onClick={() => setHelpTopic('actions')} className="absolute -top-6 right-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs flex items-center gap-1">
                                        <span className="w-4 h-4 rounded-full border flex items-center justify-center border-current">?</span> Aide
                                    </button>
                                    <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                                        <Button onClick={() => { setModal({ type: 'trade' }); setTradeType('BUY'); }} variant="success" className="justify-center h-14 w-full text-base">Acheter</Button>
                                        <Button onClick={() => { setModal({ type: 'trade' }); setTradeType('SELL'); }} variant="danger" className="justify-center h-14 w-full text-base">Vendre</Button>
                                        <Button onClick={() => setModal({ type: 'deposit' })} variant="secondary" className="justify-center h-14 w-full text-base"><Icon name="plus" className="w-4 h-4" /> Dépôt</Button>
                                        {isAdmin && <Button onClick={() => setModal({ type: 'withdraw' })} variant="secondary" className="justify-center h-14 w-full text-base"><Icon name="minus" className="w-4 h-4" /> Retrait</Button>}
                                        <Button onClick={handleAi} disabled={isAnalyzing || assets.length === 0} variant="outline" className="justify-center h-14 w-full text-base col-span-2 xl:col-span-1">
                                            {isAnalyzing ? 'Analyse...' : '✨ Coach IA'}
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Stats Row */}
                            <div className="flex flex-wrap justify-center md:justify-start gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
                                <button onClick={() => setHelpTopic('pl')} className="flex items-center gap-1">
                                    <Badge type={portfolioSummary.totalLatentPL >= 0 ? 'positive' : 'negative'}>
                                        {portfolioSummary.totalLatentPL >= 0 ? '+' : ''}{portfolioSummary.dayVariationPercent}% P&L Total
                                    </Badge>
                                </button>
                                <span className="text-slate-500 dark:text-slate-400 text-sm font-bold">
                                    {portfolioSummary.totalLatentPL >= 0 ? '+' : ''}{portfolioSummary.totalLatentPL.toLocaleString('fr-FR', { style: 'currency', currency: activeClub.currency })} latent
                                </span>
                                <span className="text-slate-400 dark:text-slate-500 text-sm">Cash : <span className="font-bold text-slate-700 dark:text-slate-300">{portfolioSummary.cashBalance.toLocaleString('fr-FR', { style: 'currency', currency: activeClub.currency })}</span></span>
                                {portfolioSummary.totalTaxLiability > 0 && (
                                    <span className="text-red-500 text-sm font-bold">Impôts provisionnés : {portfolioSummary.totalTaxLiability.toLocaleString('fr-FR', { style: 'currency', currency: activeClub.currency })}</span>
                                )}
                            </div>

                            {/* AI Insight */}
                            {aiInsight && (
                                <div className="p-5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-900 dark:text-indigo-200 rounded-2xl text-sm border border-indigo-100 dark:border-indigo-800/50 flex gap-3 animate-in fade-in duration-500">
                                    <span className="shrink-0">✨</span>
                                    <p>{aiInsight}</p>
                                    <button onClick={() => setAiInsight(null)} className="ml-auto shrink-0 opacity-50 hover:opacity-100 text-lg leading-none">×</button>
                                </div>
                            )}

                            {/* Chart */}
                            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-sm">
                                <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-lg text-slate-900 dark:text-white">Historique Quote-part</h3>
                                        <button onClick={() => setHelpTopic('nav')} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 w-4 h-4 rounded-full border flex items-center justify-center border-current text-[10px]">?</button>
                                    </div>
                                    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                                        {(['1J', '1S', '1M', '1A', 'MAX'] as TimeRange[]).map(r => (
                                            <button
                                                key={r}
                                                onClick={() => setChartRange(r)}
                                                className={`text-xs font-bold px-3 py-1.5 rounded-md transition-all ${chartRange === r ? 'bg-white dark:bg-slate-600 shadow-sm text-slate-900 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                                            >
                                                {r}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="h-[250px] md:h-[320px] w-full">
                                    {filteredHistory.length <= 1 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                                            <p className="text-sm">Pas encore de données historiques.</p>
                                            {isAdmin && <p className="text-xs">Utilisez "Figer la Quote-part" dans Admin pour créer un premier point.</p>}
                                        </div>
                                    ) : (
                                        <ResponsiveContainer>
                                            <AreaChart data={filteredHistory}>
                                                <defs>
                                                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={darkMode ? 0.1 : 0.8} />
                                                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: darkMode ? '#94a3b8' : '#64748b' }}
                                                    tickFormatter={(val) => { const d = new Date(val); return `${d.getDate()}/${d.getMonth() + 1}`; }}
                                                    interval="preserveStartEnd" />
                                                <YAxis hide={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: darkMode ? '#94a3b8' : '#64748b' }} domain={['dataMin - 1', 'dataMax + 1']} width={45} tickFormatter={v => v.toFixed(0)} />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: darkMode ? '#000' : '#fff', borderRadius: '12px', border: '1px solid #333' }}
                                                    itemStyle={{ color: darkMode ? '#fff' : '#000' }}
                                                    labelStyle={{ color: '#9ca3af' }}
                                                    labelFormatter={(l: string) => new Date(l).toLocaleDateString('fr-FR')}
                                                    formatter={(value: number) => [`${value.toFixed(2)} ${activeClub.currency}`, 'Quote-part']}
                                                />
                                                <Area type="monotone" dataKey="nav_per_share" stroke="#10b981" fill="url(#colorValue)" strokeWidth={3} activeDot={{ r: 6, fill: '#10b981' }} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {/* PORTFOLIO VIEW */}
                    {view === 'portfolio' && (
                        <Card className="p-0 overflow-hidden">
                            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white">Vos Actifs</h3>
                                    {isFetchingPrices && <p className="text-xs text-slate-400 animate-pulse mt-0.5">Mise à jour des prix...</p>}
                                </div>
                                {!activeClub.linked_bank && <Button variant="outline" className="text-xs px-3 py-2" onClick={() => setModal({ type: 'connectBank' })}>+ Banque</Button>}
                            </div>

                            {assets.length === 0 && (
                                <div className="p-12 text-center text-slate-400">
                                    <p className="text-sm">Aucun actif en portefeuille.</p>
                                    {isAdmin && <p className="text-xs mt-1">Utilisez "Acheter" pour ajouter votre premier actif.</p>}
                                </div>
                            )}

                            {/* Mobile */}
                            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                                <div className="p-4 flex justify-between items-center">
                                    <div>
                                        <div className="font-bold text-emerald-500">LIQUIDITÉS</div>
                                        <div className="text-xs text-slate-500">Cash disponible</div>
                                    </div>
                                    <div className="font-mono font-bold">{activeClub.cash_balance.toFixed(2)} {activeClub.currency}</div>
                                </div>
                                {assets.map(a => {
                                    const price = assetPrices[a.ticker] || a.avg_buy_price;
                                    const val = a.quantity * price * (a.currency !== activeClub.currency ? convertCurrency(1, a.currency, activeClub.currency) : 1);
                                    const pl = ((price - a.avg_buy_price) / a.avg_buy_price) * 100;
                                    return (
                                        <div key={a.id} className="p-4 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                            <div>
                                                <div className="font-bold text-slate-900 dark:text-white text-lg">{a.ticker}</div>
                                                <div className="text-xs text-slate-500">{a.quantity.toFixed(4)} unités · PRU {a.avg_buy_price.toFixed(2)}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-mono font-bold text-slate-900 dark:text-white">{val.toFixed(2)} {activeClub.currency}</div>
                                                <div className={`text-xs font-bold ${pl >= 0 ? 'text-green-500' : 'text-red-500'}`}>{pl > 0 ? '+' : ''}{pl.toFixed(2)}%</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Desktop */}
                            <div className="hidden md:block">
                                <Table headers={['Actif', 'Quantité', 'PRU', 'Prix Actuel', `Valeur (${activeClub.currency})`, 'P&L']}>
                                    <TableRow>
                                        <TableCell><div className="font-bold text-emerald-500">LIQUIDITÉS</div></TableCell>
                                        <TableCell>—</TableCell>
                                        <TableCell>—</TableCell>
                                        <TableCell>—</TableCell>
                                        <TableCell className="font-mono font-bold">{activeClub.cash_balance.toFixed(2)}</TableCell>
                                        <TableCell><Badge>CASH</Badge></TableCell>
                                    </TableRow>
                                    {assets.map(a => {
                                        const price = assetPrices[a.ticker] || a.avg_buy_price;
                                        const val = a.quantity * price * convertCurrency(1, a.currency, activeClub.currency);
                                        const pl = ((price - a.avg_buy_price) / a.avg_buy_price) * 100;
                                        const plAbs = val - (a.quantity * a.avg_buy_price * convertCurrency(1, a.currency, activeClub.currency));
                                        return (
                                            <TableRow key={a.id}>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md font-mono">{a.ticker}</span>
                                                        {a.currency !== activeClub.currency && <span className="text-xs text-slate-400">{a.currency}</span>}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-mono">{a.quantity.toFixed(4)}</TableCell>
                                                <TableCell className="font-mono">{a.avg_buy_price.toFixed(2)}</TableCell>
                                                <TableCell className="font-mono font-bold">{price > 0 ? price.toFixed(2) : <span className="text-slate-400 text-xs">N/A</span>}</TableCell>
                                                <TableCell className="font-mono font-bold">{val.toFixed(2)}</TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <Badge type={pl >= 0 ? 'positive' : 'negative'}>{pl > 0 ? '+' : ''}{pl.toFixed(2)}%</Badge>
                                                        <span className={`text-xs mt-1 font-mono ${plAbs >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                            {plAbs >= 0 ? '+' : ''}{plAbs.toFixed(2)}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </Table>
                                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                                    <span className="text-sm text-slate-500">Total portefeuille</span>
                                    <span className="font-bold font-mono text-slate-900 dark:text-white text-lg">
                                        {portfolioSummary.totalNetAssets.toLocaleString('fr-FR', { style: 'currency', currency: activeClub.currency })}
                                    </span>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* MEMBERS VIEW */}
                    {view === 'members' && (
                        <>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-lg dark:text-white">{members.length} membre{members.length > 1 ? 's' : ''}</h3>
                                {isAdmin && <Button onClick={() => setModal({ type: 'addMember' })}>+ Membre</Button>}
                            </div>
                            <Card className="p-0 overflow-hidden bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                {/* Mobile */}
                                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                                    {members.map(m => (
                                        <div key={m.id} className="p-4 flex justify-between items-center">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-400">
                                                    {m.full_name?.charAt(0)?.toUpperCase() || '?'}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-900 dark:text-white">{m.full_name || 'Sans nom'}</div>
                                                    <Badge type="neutral">{m.role}</Badge>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="text-right">
                                                    <div className="text-sm font-bold text-slate-900 dark:text-white">{(memberValues[m.id] || 0).toFixed(2)} {activeClub.currency}</div>
                                                    <div className="text-xs text-slate-500">{m.shares_owned.toFixed(2)} parts</div>
                                                </div>
                                                {isAdmin && m.user_id !== session?.user.id && (
                                                    <button onClick={() => { setMemberToKick(m); setModal({ type: 'kickConfirm' }); }} className="p-2 text-red-500 bg-red-50 dark:bg-red-900/20 rounded-full active:scale-90 transition-transform">✕</button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {/* Desktop */}
                                <div className="hidden md:block">
                                    <Table headers={['Membre', 'Rôle', 'Parts', 'Investi', 'Valeur Actuelle', 'P&L', '']}>
                                        {members.map(m => {
                                            const val = memberValues[m.id] || 0;
                                            const pl = val - m.total_invested_fiat;
                                            return (
                                                <TableRow key={m.id}>
                                                    <TableCell>
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-xs">
                                                                {m.full_name?.charAt(0)?.toUpperCase() || '?'}
                                                            </div>
                                                            <span className="font-medium">{m.full_name || 'Membre'}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell><Badge>{m.role}</Badge></TableCell>
                                                    <TableCell className="font-mono">{m.shares_owned.toFixed(4)}</TableCell>
                                                    <TableCell className="font-mono">{m.total_invested_fiat.toFixed(2)} {activeClub.currency}</TableCell>
                                                    <TableCell className="font-mono font-bold">{val.toFixed(2)} {activeClub.currency}</TableCell>
                                                    <TableCell>
                                                        <span className={`text-sm font-mono font-bold ${pl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                            {pl >= 0 ? '+' : ''}{pl.toFixed(2)}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        {isAdmin && m.user_id !== session?.user.id && (
                                                            <button onClick={() => { setMemberToKick(m); setModal({ type: 'kickConfirm' }); }} className="text-red-500 hover:bg-red-900/20 p-1.5 rounded-full transition-colors" title="Retirer du club">✕</button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </Table>
                                </div>
                            </Card>
                        </>
                    )}

                    {/* JOURNAL VIEW */}
                    {view === 'journal' && (
                        <Card className="p-0 overflow-hidden">
                            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                                <h3 className="font-bold text-slate-900 dark:text-white">Journal des opérations</h3>
                                <p className="text-xs text-slate-500 mt-0.5">{transactions.length} opération{transactions.length > 1 ? 's' : ''}</p>
                            </div>
                            {transactions.length === 0 && (
                                <div className="p-12 text-center text-slate-400 text-sm">Aucune opération enregistrée.</div>
                            )}
                            {/* Mobile */}
                            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                                {transactions.map(t => {
                                    const memberName = members.find(m => m.user_id === t.user_id)?.full_name;
                                    const badgeType = t.type === 'DEPOSIT' || t.type === 'SELL' ? 'positive' : t.type === 'WITHDRAWAL' ? 'negative' : 'neutral';
                                    return (
                                        <div key={t.id} className="p-4 flex justify-between items-center">
                                            <div>
                                                <Badge type={badgeType}>{t.type}</Badge>
                                                <div className="text-xs text-slate-500 mt-1">{new Date(t.created_at).toLocaleDateString('fr-FR')}</div>
                                                {memberName && <div className="text-xs text-slate-400 mt-0.5">{memberName}</div>}
                                            </div>
                                            <div className="text-right">
                                                <div className="font-bold text-slate-900 dark:text-white font-mono">
                                                    {t.asset_ticker && t.asset_ticker !== 'SNAPSHOT' ? t.asset_ticker : 'CASH'}
                                                </div>
                                                <div className="text-sm text-slate-500 font-mono">{t.amount_fiat?.toFixed(2)} {activeClub.currency}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {/* Desktop */}
                            <div className="hidden md:block">
                                <Table headers={['Date', 'Type', 'Membre', 'Actif', 'Montant', 'Détails']}>
                                    {transactions.map(t => {
                                        const memberName = members.find(m => m.user_id === t.user_id)?.full_name || '—';
                                        const badgeType = t.type === 'DEPOSIT' || t.type === 'SELL' ? 'positive' : t.type === 'WITHDRAWAL' ? 'negative' : 'neutral';
                                        return (
                                            <TableRow key={t.id}>
                                                <TableCell>{new Date(t.created_at).toLocaleDateString('fr-FR')}</TableCell>
                                                <TableCell><Badge type={badgeType}>{t.type}</Badge></TableCell>
                                                <TableCell>{memberName}</TableCell>
                                                <TableCell className="font-mono">{t.asset_ticker && t.asset_ticker !== 'SNAPSHOT' ? t.asset_ticker : '—'}</TableCell>
                                                <TableCell className="font-mono font-bold">{t.amount_fiat?.toFixed(2)} {activeClub.currency}</TableCell>
                                                <TableCell className="text-slate-500 text-xs">
                                                    {t.price_at_transaction && t.asset_ticker !== 'SNAPSHOT' ? `@ ${t.price_at_transaction.toFixed(2)}` : ''}
                                                    {t.realized_gain != null && t.realized_gain !== 0 ? ` · P&L ${t.realized_gain >= 0 ? '+' : ''}${t.realized_gain.toFixed(2)}` : ''}
                                                    {t.tax_estimate && t.tax_estimate > 0 ? ` · Impôt est. ${t.tax_estimate.toFixed(2)}` : ''}
                                                    {t.shares_change && t.shares_change !== 0 ? ` · ${t.shares_change > 0 ? '+' : ''}${t.shares_change.toFixed(4)} parts` : ''}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </Table>
                            </div>
                        </Card>
                    )}

                    {/* CHAT VIEW */}
                    {view === 'chat' && (
                        <div className="flex flex-col h-[calc(100vh-200px)] md:h-[calc(100vh-120px)] max-h-[800px]">
                            {/* Announcements pinned at top */}
                            {messages.filter(m => m.type === 'announcement').length > 0 && (
                                <div className="mb-4 space-y-2">
                                    {messages.filter(m => m.type === 'announcement').slice(-3).map(a => {
                                        const authorName = members.find(m => m.user_id === a.user_id)?.full_name || 'Admin';
                                        return (
                                            <div key={a.id} className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl">
                                                <span className="text-lg shrink-0">📣</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Annonce</span>
                                                        <span className="text-xs text-slate-400">{authorName}</span>
                                                        <span className="text-xs text-slate-400">{new Date(a.created_at).toLocaleDateString('fr-FR')}</span>
                                                    </div>
                                                    <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">{a.content}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Messages list */}
                            <div className="flex-1 overflow-y-auto space-y-3 pb-4 pr-1" id="chat-messages">
                                {messages.filter(m => m.type === 'message').length === 0 && (
                                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                                        Pas encore de messages. Dites bonjour !
                                    </div>
                                )}
                                {messages.filter(m => m.type === 'message').map(msg => {
                                    const isMe = msg.user_id === session?.user.id;
                                    const authorName = members.find(m => m.user_id === msg.user_id)?.full_name || 'Membre';
                                    const initials = authorName.charAt(0).toUpperCase();
                                    return (
                                        <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                            {!isMe && (
                                                <div className="w-7 h-7 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                                                    {initials}
                                                </div>
                                            )}
                                            <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                                                {!isMe && <span className="text-[11px] text-slate-400 px-2">{authorName}</span>}
                                                <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${isMe
                                                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-br-sm'
                                                    : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-100 dark:border-slate-700 rounded-bl-sm'
                                                }`}>
                                                    {msg.content}
                                                </div>
                                                <span className="text-[10px] text-slate-300 dark:text-slate-600 px-2">
                                                    {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Input */}
                            <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                                <div className="flex gap-2 items-end">
                                    <div className="flex-1 relative">
                                        <textarea
                                            value={chatInput}
                                            onChange={e => setChatInput(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendMessage('message');
                                                }
                                            }}
                                            placeholder="Écrire un message..."
                                            rows={1}
                                            className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border-none outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white resize-none text-sm"
                                        />
                                    </div>
                                    <Button
                                        onClick={() => handleSendMessage('message')}
                                        disabled={isSendingMessage || !chatInput.trim()}
                                        className="h-11 px-5 shrink-0"
                                    >
                                        Envoyer
                                    </Button>
                                    {isAdmin && (
                                        <Button
                                            variant="outline"
                                            onClick={() => handleSendMessage('announcement')}
                                            disabled={isSendingMessage || !chatInput.trim()}
                                            className="h-11 px-4 shrink-0 text-amber-600 border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                                        >
                                            📣
                                        </Button>
                                    )}
                                </div>
                                {isAdmin && (
                                    <p className="text-[11px] text-slate-400 mt-1.5 px-1">Entrée pour envoyer · 📣 pour épingler comme annonce</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ADMIN VIEW */}
                    {view === 'admin' && (
                        <div className="space-y-6">
                            <Card>
                                <h3 className="font-bold mb-4 text-slate-900 dark:text-white">Administration</h3>
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                                        <p className="text-xs text-slate-500 mb-1 uppercase tracking-widest font-bold">Code d'invitation</p>
                                        <span className="font-mono text-2xl font-bold tracking-widest text-slate-900 dark:text-white">{activeClub.invite_code}</span>
                                        <p className="text-xs text-slate-400 mt-2">Partagez ce code avec les membres à inviter.</p>
                                    </div>
                                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                                        <p className="text-xs text-slate-500 mb-1 uppercase tracking-widest font-bold">Devise du Club</p>
                                        <span className="font-mono text-2xl font-bold">{activeClub.currency}</span>
                                    </div>
                                </div>
                            </Card>
                            <Card>
                                <h3 className="font-bold mb-2 text-slate-900 dark:text-white">Figer la Quote-part</h3>
                                <p className="text-sm text-slate-500 mb-4">Enregistre un point dans l'historique avec la NAV actuelle ({portfolioSummary.navPerShare.toFixed(2)} {activeClub.currency}). À faire régulièrement (mensuel recommandé).</p>
                                <Button onClick={handleFreeze} disabled={isLoading} variant={freezeSuccess ? 'success' : 'primary'}>
                                    {isLoading ? 'Enregistrement...' : freezeSuccess ? '✓ Figée !' : 'Figer la Quote-part'}
                                </Button>
                            </Card>
                        </div>
                    )}
                </div>
            </main>

            {/* ===== MODALS ===== */}

            {/* ADD MEMBER */}
            <Modal isOpen={modal.type === 'addMember'} onClose={closeModal} title="Inviter un Membre">
                <div className="space-y-4">
                    {addMemberError && <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl">{addMemberError}</div>}

                    <Input type="email" placeholder="Email du membre" value={addMemberEmail} onChange={e => setAddMemberEmail(e.target.value)} />

                    {/* Primary CTA: send invite email */}
                    <Button
                        className="w-full"
                        onClick={handleSendInvite}
                        disabled={isInvitingSending || !addMemberEmail.trim()}
                    >
                        {isInvitingSending ? 'Envoi en cours...' : '✉️ Envoyer l\'invitation par email'}
                    </Button>

                    <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                        <span className="text-xs text-slate-400">ou</span>
                        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                        Si le membre a déjà un compte, ajoutez-le directement.
                    </p>
                    <Button variant="outline" className="w-full" onClick={handleManualAddMember} disabled={isLoading || !addMemberEmail.trim()}>
                        {isLoading ? 'Recherche...' : 'Ajouter directement (compte existant)'}
                    </Button>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs text-slate-500">
                        <span className="font-bold">Code d'invitation :</span>{' '}
                        <span className="font-mono font-bold tracking-widest text-slate-900 dark:text-white">{activeClub?.invite_code}</span>
                        {' '}— partageable aussi par message.
                    </div>
                </div>
            </Modal>

            {/* DEPOSIT */}
            <Modal isOpen={modal.type === 'deposit'} onClose={closeModal} title="Enregistrer un Dépôt">
                <div className="space-y-4">
                    {depositError && <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl">{depositError}</div>}
                    <select
                        value={depositMemberId}
                        onChange={e => setDepositMemberId(e.target.value)}
                        className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border-none outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white"
                    >
                        <option value="" disabled>Sélectionner un membre</option>
                        <option value="ALL">Tous les membres (même montant chacun)</option>
                        {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                    </select>
                    <div className="relative">
                        <Input type="number" placeholder="Montant" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleDeposit()} min="0" step="0.01" />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">{activeClub.currency}</span>
                    </div>
                    {depositAmount && parseFloat(depositAmount) > 0 && (
                        <p className="text-xs text-slate-500">
                            ≈ {(parseFloat(depositAmount) / (portfolioSummary.navPerShare || 100)).toFixed(4)} parts à {portfolioSummary.navPerShare.toFixed(2)} {activeClub.currency}/part
                        </p>
                    )}
                    <Button className="w-full" onClick={handleDeposit} disabled={isLoading}>
                        {isLoading ? 'Enregistrement...' : 'Confirmer le dépôt'}
                    </Button>
                </div>
            </Modal>

            {/* WITHDRAW */}
            <Modal isOpen={modal.type === 'withdraw'} onClose={closeModal} title="Enregistrer un Retrait">
                <div className="space-y-4">
                    {withdrawError && <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl">{withdrawError}</div>}
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs rounded-xl border border-amber-100 dark:border-amber-800">
                        Le retrait brûle des parts et calcule automatiquement la provision d'impôt (30% PFU sur la plus-value).
                    </div>
                    <select
                        value={withdrawMemberId}
                        onChange={e => setWithdrawMemberId(e.target.value)}
                        className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border-none outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white"
                    >
                        <option value="" disabled>Sélectionner un membre</option>
                        {members.map(m => (
                            <option key={m.id} value={m.id}>
                                {m.full_name} — {(memberValues[m.id] || 0).toFixed(2)} {activeClub.currency} dispo
                            </option>
                        ))}
                    </select>
                    <div className="relative">
                        <Input type="number" placeholder="Montant à retirer" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} min="0" step="0.01" />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">{activeClub.currency}</span>
                    </div>
                    {withdrawMemberId && withdrawAmount && parseFloat(withdrawAmount) > 0 && (() => {
                        const m = members.find(mem => mem.id === withdrawMemberId);
                        if (!m) return null;
                        const amount = parseFloat(withdrawAmount);
                        const shares = amount / portfolioSummary.navPerShare;
                        const pru = m.shares_owned > 0 ? m.total_invested_fiat / m.shares_owned : 0;
                        const capital = shares * pru;
                        const gain = amount - capital;
                        const tax = gain > 0 ? gain * 0.30 : 0;
                        return (
                            <div className="text-xs text-slate-500 space-y-1 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                                <div>Parts brûlées : <span className="font-mono font-bold">{shares.toFixed(4)}</span></div>
                                <div>Plus-value estimée : <span className={`font-mono font-bold ${gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>{gain.toFixed(2)} {activeClub.currency}</span></div>
                                {tax > 0 && <div>Impôt estimé (30% PFU) : <span className="font-mono font-bold text-red-500">{tax.toFixed(2)} {activeClub.currency}</span></div>}
                            </div>
                        );
                    })()}
                    <Button variant="danger" className="w-full" onClick={handleWithdraw} disabled={isLoading}>
                        {isLoading ? 'Enregistrement...' : 'Confirmer le retrait'}
                    </Button>
                </div>
            </Modal>

            {/* TRADE (BUY/SELL) */}
            <Modal isOpen={modal.type === 'trade'} onClose={closeModal} title={tradeType === 'BUY' ? 'Passer un Achat' : 'Passer une Vente'}>
                <div className="space-y-4">
                    {tradeError && <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl">{tradeError}</div>}

                    {tradeType === 'BUY' && (
                        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs text-slate-500">
                            Cash disponible : <span className="font-mono font-bold text-slate-900 dark:text-white">{activeClub.cash_balance.toFixed(2)} {activeClub.currency}</span>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <Input
                                placeholder="Ticker (ex: NVDA)"
                                value={tradeTicker}
                                onChange={e => setTradeTicker(e.target.value.toUpperCase())}
                                className="uppercase"
                            />
                        </div>
                        <select
                            value={tradeCurrency}
                            onChange={e => setTradeCurrency(e.target.value as 'USD' | 'EUR')}
                            className="px-4 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border-none outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white font-bold text-sm"
                        >
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                        </select>
                    </div>

                    <div className="relative">
                        <Input
                            type="number"
                            placeholder="Quantité"
                            value={tradeQty}
                            onChange={e => setTradeQty(e.target.value)}
                            min="0"
                            step="0.0001"
                        />
                    </div>

                    <div className="relative">
                        <Input
                            type="number"
                            placeholder="Prix unitaire"
                            value={isFetchingTradePrice ? '' : tradePrice}
                            onChange={e => setTradePrice(e.target.value)}
                            min="0"
                            step="0.01"
                        />
                        {isFetchingTradePrice && (
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400 animate-pulse">Récupération...</span>
                        )}
                        {!isFetchingTradePrice && tradePrice && (
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">{tradeCurrency}</span>
                        )}
                    </div>

                    {tradeQty && tradePrice && parseFloat(tradeQty) > 0 && parseFloat(tradePrice) > 0 && (
                        <div className="text-xs text-slate-500 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                            Total : <span className="font-mono font-bold text-slate-900 dark:text-white">
                                {(parseFloat(tradeQty) * parseFloat(tradePrice)).toFixed(2)} {tradeCurrency}
                                {tradeCurrency !== activeClub.currency && ` ≈ ${(parseFloat(tradeQty) * parseFloat(tradePrice) * convertCurrency(1, tradeCurrency, activeClub.currency)).toFixed(2)} ${activeClub.currency}`}
                            </span>
                        </div>
                    )}

                    {tradeType === 'SELL' && tradeTicker && (() => {
                        const asset = assets.find(a => a.ticker === tradeTicker);
                        if (!asset) return <p className="text-xs text-slate-400">Actif non trouvé en portefeuille.</p>;
                        return <p className="text-xs text-slate-500">Détenu : <span className="font-mono font-bold">{asset.quantity.toFixed(4)}</span> unités · PRU {asset.avg_buy_price.toFixed(2)}</p>;
                    })()}

                    <Button
                        variant={tradeType === 'BUY' ? 'success' : 'danger'}
                        className="w-full h-12"
                        onClick={handleTrade}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Exécution...' : `Confirmer ${tradeType === 'BUY' ? 'l\'achat' : 'la vente'}`}
                    </Button>
                </div>
            </Modal>

            {/* CONNECT BANK */}
            <Modal isOpen={modal.type === 'connectBank'} onClose={closeModal} title="Connecter une Banque">
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

            {/* KICK CONFIRM */}
            <Modal isOpen={modal.type === 'kickConfirm'} onClose={closeModal} title="Retirer un Membre">
                <div className="space-y-4">
                    <p className="text-slate-600 dark:text-slate-300 text-sm">
                        Êtes-vous sûr de vouloir retirer <span className="font-bold text-slate-900 dark:text-white">{memberToKick?.full_name}</span> du club ?
                    </p>
                    <p className="text-xs text-slate-400">Ses parts et transactions restent dans l'historique.</p>
                    <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={closeModal}>Annuler</Button>
                        <Button variant="danger" className="flex-1" onClick={handleKickMember} disabled={isLoading}>
                            {isLoading ? 'Retrait...' : 'Confirmer'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
