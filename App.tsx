import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip, XAxis, CartesianGrid } from 'recharts';
import { Club, Member, Asset, Transaction, NavEntry, PortfolioSummary, Message, Proposal, PriceAlert, DividendEntry, ProposalComment, AuditEntry, AppNotification } from './types';
import { fetchAssetPrice, convertCurrency, fetchBenchmarkHistory, fetchDividendHistory, fetchLiveExchangeRates, fetchPricesWithCache, searchTickers } from './services/financeEngine';
import { generateInviteCode, calculatePortfolioState, executeBuyOrder, executeSellOrder, executeWithdrawal, createNavSnapshot } from './services/ClubManager';
import { analyzePortfolioDistribution } from './services/geminiService';
import { Card, Button, Input, Badge, Modal, Table, TableRow, TableCell, Logo, Icon } from './components/ui';
import { PortfolioAnalysis } from './components/PortfolioAnalysis';
import { supabase } from './lib/supabaseClient';
import { Session } from '@supabase/supabase-js';

// --- CONSTANTS ---

const AVAILABLE_BANKS = [
    { id: 'bourso', name: 'BoursoBank', logo: 'B' },
    { id: 'tr', name: 'Trade Republic', logo: 'T' },
    { id: 'fortuneo', name: 'Fortuneo', logo: 'F' },
    { id: 'ibkr', name: 'Interactive Brokers', logo: 'I' },
];

// Popular instruments for quick-pick in trade modal
const POPULAR_INSTRUMENTS: Array<{ ticker: string; label: string; currency: 'USD' | 'EUR' }> = [
    { ticker: 'CW8', label: 'MSCI World', currency: 'EUR' },
    { ticker: 'IWDA', label: 'World iShares', currency: 'USD' },
    { ticker: 'SPY', label: 'S&P 500 ETF', currency: 'USD' },
    { ticker: 'QQQ', label: 'Nasdaq 100', currency: 'USD' },
    { ticker: 'PANX', label: 'Nasdaq iShares', currency: 'EUR' },
    { ticker: 'CACX', label: 'CAC 40 ETF', currency: 'EUR' },
    { ticker: 'AAPL', label: 'Apple', currency: 'USD' },
    { ticker: 'NVDA', label: 'Nvidia', currency: 'USD' },
    { ticker: 'MSFT', label: 'Microsoft', currency: 'USD' },
    { ticker: 'AMZN', label: 'Amazon', currency: 'USD' },
    { ticker: 'GOOGL', label: 'Alphabet', currency: 'USD' },
    { ticker: 'MC', label: 'LVMH', currency: 'EUR' },
    { ticker: 'BRK/B', label: 'Berkshire B', currency: 'USD' },
    { ticker: 'TTE', label: 'TotalEnergies', currency: 'EUR' },
];

type TimeRange = '1J' | '1S' | '1M' | '1A' | 'MAX';
type ViewState = 'landing' | 'auth' | 'onboarding' | 'dashboard' | 'portfolio' | 'members' | 'journal' | 'chat' | 'guide' | 'votes' | 'admin' | 'analysis' | 'settings';
type ModalType = 'addMember' | 'deposit' | 'trade' | 'connectBank' | 'withdraw' | 'kickConfirm' | 'resetClub' | null;

// --- INLINE NOTIFICATION ---
const Notification: React.FC<{ message: string; type: 'success' | 'error'; onClose: () => void }> = ({ message, type, onClose }) => (
    <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl animate-in slide-in-from-top-4 duration-300 ${type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
        <span className="text-sm font-semibold">{message}</span>
        <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100 text-lg leading-none">×</button>
    </div>
);

// --- PWA INSTALL BANNER ---
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
const isInStandaloneMode = () => ('standalone' in window.navigator && (window.navigator as any).standalone) || window.matchMedia('(display-mode: standalone)').matches;

const PWAInstallBanner: React.FC = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showIOSGuide, setShowIOSGuide] = useState(false);
    const [dismissed, setDismissed] = useState(() => localStorage.getItem('pwa-banner-dismissed') === '1');

    useEffect(() => {
        if (isInStandaloneMode() || dismissed) return;

        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handler as any);

        // Show iOS guide automatically after a short delay if on iOS
        if (isIOS() && !isInStandaloneMode()) {
            const t = setTimeout(() => setShowIOSGuide(true), 3000);
            return () => { clearTimeout(t); window.removeEventListener('beforeinstallprompt', handler as any); };
        }
        return () => window.removeEventListener('beforeinstallprompt', handler as any);
    }, [dismissed]);

    const dismiss = () => {
        localStorage.setItem('pwa-banner-dismissed', '1');
        setDismissed(true);
        setShowIOSGuide(false);
        setDeferredPrompt(null);
    };

    const handleAndroidInstall = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') dismiss();
        setDeferredPrompt(null);
    };

    if (dismissed || isInStandaloneMode()) return null;

    // Android / Chrome: native prompt available
    if (deferredPrompt) {
        return (
            <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[90] w-[calc(100%-2rem)] max-w-sm">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-4 flex items-center gap-4 animate-in slide-in-from-bottom-4 duration-300">
                    <div className="w-12 h-12 bg-slate-900 dark:bg-white rounded-2xl flex items-center justify-center shrink-0">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M3 21H21" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                            <path d="M3 16L9 10L13 14L21 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M21 6V10M21 6H17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">Installer ClubInvest</p>
                        <p className="text-xs text-slate-500 mt-0.5">Accès rapide depuis votre écran d'accueil</p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <button onClick={handleAndroidInstall} className="px-3 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-xl">
                            Installer
                        </button>
                        <button onClick={dismiss} className="px-3 py-1.5 text-slate-400 text-xs font-medium rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
                            Plus tard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // iOS Safari: manual guide
    if (showIOSGuide) {
        return (
            <div className="fixed inset-0 z-[90] flex items-end">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={dismiss} />
                <div className="relative w-full bg-white dark:bg-slate-900 rounded-t-3xl p-6 pb-10 animate-in slide-in-from-bottom duration-300 border-t border-slate-200 dark:border-slate-700">
                    <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-5" />
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center shrink-0">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path d="M3 21H21" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                                <path d="M3 16L9 10L13 14L21 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M21 6V10M21 6H17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                        <div>
                            <p className="font-bold text-slate-900 dark:text-white">Installer ClubInvest</p>
                            <p className="text-xs text-slate-500">Ajoutez l'app à votre écran d'accueil</p>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {[
                            { step: '1', icon: '⬆️', text: 'Appuyez sur le bouton Partager en bas de Safari' },
                            { step: '2', icon: '➕', text: 'Faites défiler et appuyez sur "Sur l\'écran d\'accueil"' },
                            { step: '3', icon: '✅', text: 'Appuyez sur "Ajouter" en haut à droite' },
                        ].map(s => (
                            <div key={s.step} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                                <span className="text-xl leading-none">{s.icon}</span>
                                <p className="text-sm text-slate-700 dark:text-slate-300">{s.text}</p>
                            </div>
                        ))}
                    </div>
                    <button onClick={dismiss} className="mt-5 w-full py-3 text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
                        Fermer
                    </button>
                </div>
            </div>
        );
    }

    return null;
};

// --- GUIDE VIEW ---
const GUIDE_SECTIONS = [
    {
        emoji: '📊',
        title: 'La Quote-Part (NAV) — comment ça marche',
        content: [
            'La NAV (Net Asset Value) mesure la valeur nette d\'une part de votre club.',
            'Formule : (Valeur des actifs + Trésorerie − Provisions fiscales) ÷ Nombre de parts',
            'Au démarrage, la NAV est fixée à 100 €. Si vous déposez 1 000 € quand la NAV est à 120 €, vous recevez 8,33 parts.',
            'Votre valeur dans le club = parts détenues × NAV du jour.',
            'C\'est juste et équitable : chacun entre et sort au prix réel du marché, sans diluer les autres.',
            'Figez la NAV au moins une fois par mois (onglet Admin) pour garder un historique propre.',
        ]
    },
    {
        emoji: '🏛️',
        title: 'Cadre légal — structure et membres',
        content: [
            'Un club d\'investissement fonctionne en indivision : pas de personnalité morale, aucune immatriculation requise.',
            'Entre 5 et 20 membres maximum — tous doivent être des personnes physiques (pas de sociétés). Si le club tombe sous 5 membres, il doit être dissous.',
            'Tous les membres doivent approuver à l\'unanimité l\'admission de tout nouveau membre.',
            'Chaque membre ne peut appartenir qu\'à un seul club d\'investissement bénéficiant du régime fiscal favorable.',
            'Le club ne peut ni emprunter ni contracter de dettes. Il est interdit d\'utiliser le levier.',
            'La rédaction d\'une convention (statuts) entre membres est fortement recommandée : elle précise les règles d\'entrée, de sortie, de vote, et la gestion en cas de décès.',
            'Investissements autorisés : actions cotées, obligations, ETF/OPCVM, warrants (dans la limite de 10 % du volume annuel de transactions). Crypto et forex sont exclus du régime.',
        ]
    },
    {
        emoji: '🔑',
        title: 'L\'avantage fiscal clé : le report d\'imposition',
        content: [
            'C\'est le principal avantage d\'un club : les plus-values réalisées par le club sur la vente de titres ne sont PAS imposées tant qu\'un membre ne sort pas ses fonds.',
            'Concrètement : le club peut acheter, vendre, réinvestir les gains en interne année après année — aucun impôt n\'est dû pendant ce temps.',
            'L\'imposition intervient uniquement au moment du retrait d\'un membre ou de la dissolution du club.',
            'À la dissolution, les membres peuvent choisir de recevoir les titres en nature (non en cash). Dans ce cas, aucune imposition n\'est déclenchée à ce moment — elle est reportée jusqu\'à la vente personnelle des titres.',
            'Comparaison : sur un CTO individuel, chaque vente de titre est un fait générateur d\'impôt immédiat. Le club élimine cette friction et permet un effet "boule de neige" sur les gains réinvestis.',
            'Attention : ce report ne s\'applique PAS aux dividendes et intérêts — ceux-ci sont déclarés annuellement par chaque membre au prorata de sa quote-part.',
        ]
    },
    {
        emoji: '📋',
        title: 'Fiscalité à la sortie — ce que vous payez',
        content: [
            'Lors d\'un retrait, la plus-value (différence entre valeur de sortie et coût d\'entrée) est soumise au PFU de 31,4 %.',
            'PFU 2026 : 12,8 % d\'impôt sur le revenu + 18,6 % de prélèvements sociaux (dont CSG 10,6 % après la hausse de +1,4 pt de la LFSS 2026).',
            'Option possible : barème progressif de l\'IR à la place des 12,8 % — pertinent si votre tranche marginale est inférieure à 12,8 %.',
            'Dividendes et intérêts : déclarés chaque année, également soumis au PFU de 31,4 % (ou barème progressif sur option).',
            'Le courtier émet un IFU (formulaire 2561) avant le 16 février de l\'année suivante. C\'est lui — pas le club — qui déclare à l\'administration fiscale.',
            'Chaque membre utilise les chiffres de son IFU pour remplir sa déclaration personnelle (lignes 2DC, 2TR du formulaire 2042).',
            '⚠️ Les taux évoluent avec chaque loi de finances. Vérifiez toujours les taux actuels sur impots.gouv.fr.',
        ]
    },
    {
        emoji: '💰',
        title: 'Plafond de versement et optimisation',
        content: [
            'Chaque foyer fiscal ne peut verser que 5 500 € par an dans un club d\'investissement (source : BOFIP BOI-RPPM-RCM-40-20).',
            'Ce plafond s\'applique au foyer entier : un couple partage les 5 500 €, qu\'ils soient dans le même club ou dans des clubs différents.',
            'Les dividendes réinvestis par le club comptent également dans ce plafond annuel.',
            'Le plafond s\'applique aux versements entrants, pas à la valeur des parts — vos parts peuvent valoir bien plus que 5 500 € si elles ont bien performé.',
            'Comparaison PEA : le PEA permet 150 000 € de versements avec une exonération d\'IR après 5 ans, ce qui est fiscalement plus avantageux pour les détenteurs long terme. Le club compense par la dimension collective et le report d\'imposition sur les plus-values intermédiaires.',
        ]
    },
    {
        emoji: '⚰️',
        title: 'Décès d\'un membre',
        content: [
            'Le club ne se poursuit pas avec les héritiers du membre décédé : les héritiers ne deviennent pas automatiquement membres.',
            'La part du défunt est liquidée au prix de marché, avec une déduction d\'environ 2 % pour couvrir les frais de transaction.',
            'La valeur nette est versée aux héritiers (ou au notaire en charge de la succession) — ils reçoivent du cash, pas des titres.',
            'Si le décès fait tomber le nombre de membres sous 5, le club doit être dissous.',
            'Pour éviter les situations difficiles, il est vivement recommandé que les statuts prévoient explicitement la procédure de liquidation en cas de décès.',
        ]
    },
    {
        emoji: '💡',
        title: 'Pourquoi investir en club plutôt que seul ?',
        content: [
            'Report d\'imposition : les gains restent investis sans frottement fiscal tant que personne ne sort — c\'est l\'avantage principal.',
            'Ticket d\'entrée réduit : en mettant en commun les épargnes, vous accédez à des actions ou ETF autrement hors de portée individuellement.',
            'Mutualisation des frais : un seul ordre de bourse = un seul frais, divisé entre tous les membres.',
            'Diversification accrue : avec plus de capital, vous répartissez sur davantage de lignes, réduisant le risque idiosyncratique.',
            'Apprentissage collectif : chacun apporte son analyse, ses idées, son domaine d\'expertise — la qualité des décisions s\'améliore.',
            'Discipline de groupe : les décisions collégiales évitent les réactions émotionnelles et forcent à argumenter chaque choix.',
        ]
    },
    {
        emoji: '🏦',
        title: 'Choisir son courtier',
        content: [
            'Peu de courtiers acceptent les comptes collectifs pour clubs d\'investissement. Vérifiez toujours leur politique avant d\'ouvrir.',
            'Parmi les courtiers bancaires traditionnels : Société Générale, CIC et BNP Paribas acceptent historiquement les comptes clubs.',
            'Parmi les courtiers en ligne : certains acceptent les clubs — renseignez-vous directement, les politiques changent régulièrement.',
            'Critères de choix : frais de courtage par ordre, frais de tenue de compte, accès aux marchés internationaux, qualité de l\'IFU fourni.',
            'Centralisez les virements des membres sur un compte courant commun (ex. Société Générale pro ou N26 Business), puis faites un seul virement vers le courtier pour minimiser les frais.',
            '⚠️ Toujours vérifier qu\'un courtier accepte encore les nouveaux clubs avant d\'engager les démarches — les politiques évoluent.',
        ]
    },
    {
        emoji: '✅',
        title: 'Règles de bonne gestion recommandées',
        content: [
            'Figer la NAV une fois par mois (onglet Admin) pour maintenir un historique de performance fiable.',
            'Garder minimum 10–20 % de trésorerie pour saisir les opportunités et faire face aux demandes de retrait sans vendre en urgence.',
            'Voter collectivement avant chaque achat/vente — ClubInvest enregistre l\'historique dans le Journal.',
            'Définir ensemble un horizon d\'investissement clair (long terme, 5+ ans recommandé pour les actions).',
            'Organiser une réunion annuelle pour approuver les comptes, élire le gérant et décider des orientations.',
            'Tenir des statuts à jour : règles d\'entrée/sortie, préavis de retrait, procédure en cas de décès ou de mésentente.',
        ]
    },
];

const GuideView: React.FC = () => {
    const [openIndex, setOpenIndex] = useState<number | null>(0);
    return (
        <div className="space-y-3">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Guide & Fiscalité</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Tout ce que votre club doit savoir pour investir sereinement.</p>
            </div>
            {GUIDE_SECTIONS.map((section, i) => (
                <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
                    <button
                        onClick={() => setOpenIndex(openIndex === i ? null : i)}
                        className="w-full flex items-center gap-4 px-6 py-5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                        <span className="text-2xl">{section.emoji}</span>
                        <span className="flex-1 font-semibold text-slate-900 dark:text-white text-sm">{section.title}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={`text-slate-400 transition-transform duration-200 ${openIndex === i ? 'rotate-180' : ''}`}>
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </button>
                    {openIndex === i && (
                        <div className="px-6 pb-6 space-y-3 border-t border-slate-100 dark:border-slate-800 pt-4">
                            {section.content.map((line, j) => (
                                <div key={j} className="flex gap-3 text-sm text-slate-600 dark:text-slate-300">
                                    <span className="text-slate-300 dark:text-slate-600 mt-0.5 shrink-0">—</span>
                                    <span>{line}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
            <p className="text-center text-xs text-slate-400 dark:text-slate-600 pt-2">
                Informations à titre indicatif · Consultez un conseiller fiscal pour votre situation personnelle
            </p>
        </div>
    );
};

// --- AUTH SCREEN ---
const AuthScreen: React.FC<{ onAuthSuccess: () => void; onBack: () => void }> = ({ onAuthSuccess, onBack }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [loginIdentifier, setLoginIdentifier] = useState('');
    const [signupEmail, setSignupEmail] = useState('');
    const [signupUsername, setSignupUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
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
                        <Input type="text" placeholder="Email ou pseudo" value={loginIdentifier} onChange={e => setLoginIdentifier(e.target.value)} autoComplete="username" />
                    ) : (
                        <>
                            <div className="relative">
                                <Input type="text" placeholder="Pseudo (ex: jean42)" value={signupUsername} onChange={e => setSignupUsername(e.target.value.replace(/\s/g, ''))} autoComplete="username" />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400">utilisé pour se connecter</span>
                            </div>
                            <Input type="email" placeholder="Email" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} autoComplete="email" />
                        </>
                    )}
                    <div className="relative">
                        <Input type={showPassword ? 'text' : 'password'} placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} autoComplete={isLogin ? 'current-password' : 'new-password'} />
                        <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs font-semibold select-none">
                            {showPassword ? 'Cacher' : 'Voir'}
                        </button>
                    </div>
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
            <div className="flex items-center justify-center min-h-screen bg-zinc-50 dark:bg-black">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-zinc-200 dark:border-zinc-800 border-t-emerald-500 rounded-full animate-spin" />
                    <p className="text-zinc-500 text-sm font-medium">Vérification en cours...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-black relative">
            <div className="absolute top-6 left-6">
                <button onClick={() => supabase.auth.signOut()} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors text-sm">← Déconnexion</button>
            </div>

            <div className="flex flex-col items-center justify-center min-h-screen p-6 py-20">
                {/* Header */}
                <div className="text-center mb-10">
                    <Logo className="justify-center mb-5" />
                    <h1 className="text-2xl font-black text-zinc-900 dark:text-white mb-2">Bienvenue sur ClubInvest</h1>
                    <p className="text-zinc-500 text-sm">Connecté en tant que <span className="font-semibold text-zinc-700 dark:text-zinc-300">{user?.email}</span></p>
                </div>

                {/* How it works — 3 steps */}
                <div className="flex flex-col md:flex-row gap-4 max-w-2xl w-full mb-10">
                    {[
                        { step: '01', icon: '👥', title: 'Créez ou rejoignez', desc: 'Formez un club entre amis ou collègues. Entre 2 et 20 membres.' },
                        { step: '02', icon: '💰', title: 'Investissez ensemble', desc: 'Chaque membre dépose, achète et suit sa quote-part en temps réel.' },
                        { step: '03', icon: '📈', title: 'Suivez la performance', desc: 'Graphiques, analyses IA et comparaison aux grands indices.' },
                    ].map(s => (
                        <div key={s.step} className="flex-1 p-5 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex gap-4 items-start">
                            <span className="text-2xl shrink-0">{s.icon}</span>
                            <div>
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Étape {s.step}</p>
                                <p className="font-bold text-zinc-900 dark:text-white text-sm mb-1">{s.title}</p>
                                <p className="text-xs text-zinc-500 leading-relaxed">{s.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {error && <div className="mb-6 p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-sm rounded-xl border border-red-100 dark:border-red-900/50 max-w-lg w-full text-center">{error}</div>}

                {/* Action cards */}
                <div className="max-w-2xl w-full grid md:grid-cols-2 gap-5">
                    <Card className="space-y-4 !p-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-2xl bg-zinc-900 dark:bg-white flex items-center justify-center shrink-0">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" className="dark:stroke-zinc-900" strokeWidth="2.5" strokeLinecap="round">
                                    <path d="M12 5v14M5 12h14" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-zinc-900 dark:text-white">Créer un club</h2>
                                <p className="text-xs text-zinc-500">Vous serez administrateur</p>
                            </div>
                        </div>
                        <Input placeholder="Ex : Club des Amis Investisseurs" value={newClubName} onChange={e => setNewClubName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()} />
                        <Button className="w-full" onClick={handleCreate} disabled={isLoading || !newClubName.trim()}>
                            {isLoading ? 'Création...' : 'Créer mon club →'}
                        </Button>
                    </Card>
                    <Card className="space-y-4 !p-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center shrink-0">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-zinc-900 dark:text-white">Rejoindre un club</h2>
                                <p className="text-xs text-zinc-500">Code d'invitation de votre admin</p>
                            </div>
                        </div>
                        <Input placeholder="XXXXXX" className="text-center font-mono text-2xl uppercase tracking-widest" maxLength={6} value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && handleJoin()} />
                        <Button variant="outline" className="w-full" onClick={handleJoin} disabled={isLoading || joinCode.length < 6}>
                            {isLoading ? 'Vérification...' : 'Rejoindre →'}
                        </Button>
                    </Card>
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
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingPrices, setIsFetchingPrices] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(false);

    // App Data
    const [members, setMembers] = useState<Member[]>([]);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [navHistory, setNavHistory] = useState<NavEntry[]>([]);
    const [assetPrices, setAssetPrices] = useState<Record<string, number>>({});

    // UI State
    const [view, setView] = useState<ViewState>('landing');
    const [darkMode, setDarkMode] = useState(() => {
        const saved = localStorage.getItem('theme');
        if (saved) return saved === 'dark';
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });
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
    const [tradeConfirmStep, setTradeConfirmStep] = useState(false);
    const [freezeSuccess, setFreezeSuccess] = useState(false);
    const [balanceHidden, setBalanceHidden] = useState(false);
    const [isConnectingBank, setIsConnectingBank] = useState(false);
    const [resetPassword, setResetPassword] = useState('');
    const [resetError, setResetError] = useState<string | null>(null);
    const [isResetting, setIsResetting] = useState(false);

    // Votes / Proposals state
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [myVotes, setMyVotes] = useState<Record<string, 'for' | 'against'>>({});
    const [showProposalForm, setShowProposalForm] = useState(false);
    const [proposalForm, setProposalForm] = useState({ type: 'BUY' as 'BUY' | 'SELL', ticker: '', quantity: '', price: '', thesis: '' });
    const [isSubmittingProposal, setIsSubmittingProposal] = useState(false);
    const [proposalError, setProposalError] = useState<string | null>(null);
    const [proposalComments, setProposalComments] = useState<Record<string, ProposalComment[]>>({});
    const [expandedProposalId, setExpandedProposalId] = useState<string | null>(null);
    const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
    const [isPostingComment, setIsPostingComment] = useState(false);

    // Benchmark
    const [benchmarkData, setBenchmarkData] = useState<{ date: string; value: number }[]>([]);
    const [benchmarkSymbol, setBenchmarkSymbol] = useState<'SPY' | '^FCHI' | null>(null);
    const [isFetchingBenchmark, setIsFetchingBenchmark] = useState(false);

    // Price alerts
    const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
    const [alertForm, setAlertForm] = useState({ ticker: '', price: '', direction: 'above' as 'above' | 'below', note: '' });

    // Notifications
    const [appNotifications, setAppNotifications] = useState<AppNotification[]>([]);
    const [showNotifications, setShowNotifications] = useState(false);

    // Audit log
    const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

    // Rebalancing targets (localStorage)
    const [rebalancingTargets, setRebalancingTargets] = useState<Record<string, number>>({});

    // Expenses
    const [expenseForm, setExpenseForm] = useState({ amount: '', description: '' });
    const [isAddingExpense, setIsAddingExpense] = useState(false);

    // Quorum setting (admin)
    const [quorumInput, setQuorumInput] = useState('');

    // Dissolution
    const [dissolutionStep, setDissolutionStep] = useState(0);
    const [dissolutionPassword, setDissolutionPassword] = useState('');
    const [isDissolving, setIsDissolving] = useState(false);

    // Asset history chart
    const [selectedAssetTicker, setSelectedAssetTicker] = useState<string | null>(null);
    const [assetHistoryData, setAssetHistoryData] = useState<{ date: string; close: number }[]>([]);
    const [isFetchingAssetHistory, setIsFetchingAssetHistory] = useState(false);

    // Ticker search autocomplete
    const [tickerSearchResults, setTickerSearchResults] = useState<{ symbol: string; instrument_name: string }[]>([]);
    const [showTickerDropdown, setShowTickerDropdown] = useState(false);

    // Mobile "more" menu
    const [showMobileMore, setShowMobileMore] = useState(false);

    // User settings state
    const [settingsName, setSettingsName] = useState('');
    const [isSavingSettings, setIsSavingSettings] = useState(false);

    // Dividends
    const [dividends, setDividends] = useState<DividendEntry[]>([]);

    // Journal filter
    const [journalFilter, setJournalFilter] = useState<'ALL' | 'DEPOSIT' | 'WITHDRAWAL' | 'BUY' | 'SELL' | 'DIVIDEND' | 'EXPENSE'>('ALL');

    // Chat state
    const [messages, setMessages] = useState<Message[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [isInvitingSending, setIsInvitingSending] = useState(false);
    const [lastSeenMessageCount, setLastSeenMessageCount] = useState(0);

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
        setTradeCurrency('USD');
        setTradeConfirmStep(false);
        setDepositAmount('');
        setWithdrawAmount('');
        setDepositMemberId('');
        setWithdrawMemberId('');
        setAddMemberEmail('');
        setMemberToKick(null);
        setResetPassword('');
        setResetError(null);
    };

    // --- DARK MODE ---
    useEffect(() => {
        document.documentElement.classList.toggle('dark', darkMode);
        localStorage.setItem('theme', darkMode ? 'dark' : 'light');
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
        setIsLoadingData(true);
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
        setIsLoadingData(false);
    };

    // --- LOAD MESSAGES ---
    const loadMessages = async (clubId: string) => {
        try {
            const { data, error } = await supabase
                .from('messages')
                .select('id, club_id, user_id, content, type, created_at')
                .eq('club_id', clubId)
                .order('created_at', { ascending: true })
                .limit(100);
            if (!error && data) setMessages(data as Message[]);
        } catch {
            // Silently ignore (abort on unmount, table missing, etc.)
        }
    };

    // --- REALTIME CHAT SUBSCRIPTION ---
    useEffect(() => {
        if (!activeClub) return;
        loadMessages(activeClub.id);

        let channel: ReturnType<typeof supabase.channel> | null = null;
        try {
            channel = supabase
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
        } catch {
            // Realtime unavailable — chat works in polling-free degraded mode
        }

        return () => { if (channel) supabase.removeChannel(channel); };
    }, [activeClub?.id]);

    // --- LIVE EXCHANGE RATES ---
    useEffect(() => {
        fetchLiveExchangeRates().catch(() => {});
    }, []);

    // --- REAL TIME PRICES (with Supabase cache) ---
    useEffect(() => {
        if (!activeClub || assets.length === 0) return;
        const fetchPrices = async () => {
            setIsFetchingPrices(true);
            const newPrices = await fetchPricesWithCache(assets.map(a => a.ticker));
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

    // Per-member portfolio value (must be here, before early returns)
    const memberValues = useMemo(() => {
        const nav = portfolioSummary.navPerShare;
        return members.reduce((acc, m) => {
            acc[m.id] = m.shares_owned * nav;
            return acc;
        }, {} as Record<string, number>);
    }, [members, portfolioSummary.navPerShare]);

    // High water mark + drawdown
    const highWaterMark = useMemo(() => {
        const allNavs = [100, ...navHistory.map(n => n.nav_per_share), portfolioSummary.navPerShare];
        return Math.max(...allNavs);
    }, [navHistory, portfolioSummary.navPerShare]);

    const drawdown = portfolioSummary.navPerShare < highWaterMark
        ? parseFloat(((portfolioSummary.navPerShare - highWaterMark) / highWaterMark * 100).toFixed(2))
        : 0;

    // Last deposit date per member (for contribution reminder badges)
    const memberLastDeposit = useMemo(() => {
        return members.reduce((acc, m) => {
            const last = transactions
                .filter(t => t.type === 'DEPOSIT' && t.user_id === m.user_id)
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
            acc[m.id] = last?.created_at || null;
            return acc;
        }, {} as Record<string, string | null>);
    }, [members, transactions]);

    // Benchmark % return aligned to first nav snapshot
    const benchmarkComparison = useMemo(() => {
        if (!benchmarkData.length || navHistory.length < 1) return null;
        const sorted = [...navHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const firstNav = sorted[0];
        const firstDate = new Date(firstNav.date).getTime();
        const basePoint = benchmarkData.reduce((prev, curr) =>
            Math.abs(new Date(curr.date).getTime() - firstDate) < Math.abs(new Date(prev.date).getTime() - firstDate) ? curr : prev
        );
        const latest = benchmarkData[benchmarkData.length - 1];
        const benchReturn = parseFloat(((latest.value - basePoint.value) / basePoint.value * 100).toFixed(2));
        const clubReturn = parseFloat(((portfolioSummary.navPerShare - firstNav.nav_per_share) / firstNav.nav_per_share * 100).toFixed(2));
        return { clubReturn, benchReturn, symbol: benchmarkSymbol };
    }, [benchmarkData, navHistory, portfolioSummary.navPerShare, benchmarkSymbol]);

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
            // Auto-record NAV snapshot for today after deposit
            try {
                const newCash = depositMemberId === 'ALL'
                    ? (Number(activeClub.cash_balance) || 0) + (amount * members.length)
                    : (Number(activeClub.cash_balance) || 0) + amount;
                const newShares = depositMemberId === 'ALL'
                    ? (Number(activeClub.total_shares) || 0) + (sharesToAdd * members.length)
                    : (Number(activeClub.total_shares) || 0) + sharesToAdd;
                const newNav = newShares > 0 ? newCash / newShares : currentNav;
                await autoSnapshot(activeClub.id, newNav, newCash);
            } catch { /* non-blocking */ }
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
            try { await autoSnapshot(activeClub.id, updatedClub.total_shares > 0 ? (updatedClub.cash_balance - updatedClub.tax_liability) / updatedClub.total_shares : portfolioSummary.navPerShare, updatedClub.cash_balance - updatedClub.tax_liability); } catch { /* non-blocking */ }
            closeModal();
            notify(`Retrait de ${amount.toFixed(2)} € enregistré.`);
        } catch (e: any) {
            setWithdrawError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFetchTradePrice = async () => {
        if (!tradeTicker.trim()) return;
        setIsFetchingTradePrice(true);
        const price = await fetchAssetPrice(tradeTicker.trim().toUpperCase());
        if (price > 0) setTradePrice(price.toString());
        else notify("Prix non trouvé pour ce ticker.", 'error');
        setIsFetchingTradePrice(false);
    };

    const handleTrade = async () => {
        setTradeError(null);
        if (!activeClub || !currentUserMember) return;
        const qty = parseFloat(tradeQty);
        const price = parseFloat(tradePrice);
        if (isNaN(qty) || qty <= 0) { setTradeError("Quantité invalide."); return; }
        if (isNaN(price) || price <= 0) { setTradeError("Prix invalide."); return; }
        if (!tradeTicker.trim()) { setTradeError("Ticker obligatoire."); return; }

        // First click → show confirm step
        if (!tradeConfirmStep) { setTradeConfirmStep(true); return; }

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
            // Auto-record NAV snapshot after trade (NAV changes due to P&L)
            try {
                const newNetAssets = result.updatedClub.cash_balance - result.updatedClub.tax_liability +
                    result.updatedAssets.reduce((s, a) => s + a.quantity * (assetPrices[a.ticker] || a.avg_buy_price) * convertCurrency(1, a.currency, activeClub.currency), 0);
                const newNav = activeClub.total_shares > 0 ? newNetAssets / activeClub.total_shares : portfolioSummary.navPerShare;
                await autoSnapshot(activeClub.id, newNav, newNetAssets);
            } catch { /* non-blocking */ }
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
            const today = new Date().toISOString().split('T')[0];
            // Upsert: update today's snapshot if already exists, otherwise insert
            const { error } = await supabase.from('nav_history').upsert({
                club_id: activeClub.id,
                date: today,
                nav_per_share: parseFloat(portfolioSummary.navPerShare.toFixed(4)),
                total_net_assets: parseFloat(portfolioSummary.totalNetAssets.toFixed(2)),
            }, { onConflict: 'club_id,date' });
            if (error) throw error;
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

    const handleResetClub = async () => {
        if (!activeClub || !session) return;
        setIsResetting(true);
        setResetError(null);
        try {
            // Re-authenticate to verify password
            const { error: authErr } = await supabase.auth.signInWithPassword({
                email: session.user.email!,
                password: resetPassword
            });
            if (authErr) throw new Error('Mot de passe incorrect.');

            // Wipe financial records
            await supabase.from('transactions').delete().eq('club_id', activeClub.id);
            await supabase.from('assets').delete().eq('club_id', activeClub.id);
            await supabase.from('nav_history').delete().eq('club_id', activeClub.id);

            // Reset club financials
            await supabase.from('clubs').update({
                cash_balance: 0,
                total_shares: 0,
                tax_liability: 0
            }).eq('id', activeClub.id);

            // Reset all members' share counts
            await supabase.from('club_members').update({
                shares_owned: 0,
                total_invested_fiat: 0
            }).eq('club_id', activeClub.id);

            setResetPassword('');
            closeModal();
            await loadClubData(activeClub.id);
            notify('Club réinitialisé. Les membres sont conservés.');
        } catch (e: any) {
            setResetError(e.message);
        } finally {
            setIsResetting(false);
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

    // --- PROPOSALS & VOTES ---
    const handleSubmitProposal = async () => {
        if (!activeClub || !session || !currentUserMember) return;
        setIsSubmittingProposal(true);
        setProposalError(null);
        try {
            const qty = parseFloat(proposalForm.quantity);
            const price = parseFloat(proposalForm.price);
            if (!proposalForm.ticker.trim()) throw new Error('Ticker obligatoire.');
            if (isNaN(qty) || qty <= 0) throw new Error('Quantité invalide.');
            if (isNaN(price) || price <= 0) throw new Error('Prix invalide.');
            if (!proposalForm.thesis.trim()) throw new Error('La thèse est obligatoire.');
            const { data, error } = await supabase.from('proposals').insert({
                club_id: activeClub.id,
                proposer_id: session.user.id,
                proposer_name: currentUserMember.full_name,
                type: proposalForm.type,
                ticker: proposalForm.ticker.trim().toUpperCase(),
                quantity: qty,
                price,
                currency: activeClub.currency,
                thesis: proposalForm.thesis.trim(),
                status: 'pending',
                votes_for: 0,
                votes_against: 0,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            }).select().single();
            if (error) throw error;
            setProposals(prev => [data as Proposal, ...prev]);
            setProposalForm({ type: 'BUY', ticker: '', quantity: '', price: '', thesis: '' });
            setShowProposalForm(false);
            notify('Proposition soumise au vote.');
        } catch (e: any) {
            setProposalError(e.message);
        } finally {
            setIsSubmittingProposal(false);
        }
    };

    const handleVote = async (proposalId: string, vote: 'for' | 'against') => {
        if (!session || !activeClub) return;
        try {
            const { error } = await supabase.from('votes').insert({ proposal_id: proposalId, user_id: session.user.id, vote });
            if (error) throw error;
            const newProposals = proposals.map(p => {
                if (p.id !== proposalId) return p;
                const updated = {
                    ...p,
                    votes_for: p.votes_for + (vote === 'for' ? 1 : 0),
                    votes_against: p.votes_against + (vote === 'against' ? 1 : 0)
                };
                // Quorum-aware auto-close
                const total = members.length;
                const quorumPct = (activeClub as any).quorum_pct ?? 60;
                const participationPct = total > 0 ? ((updated.votes_for + updated.votes_against) / total) * 100 : 0;
                const quorumReached = participationPct >= quorumPct;
                const majority = Math.floor(total / 2) + 1;
                let newStatus: Proposal['status'] = 'pending';
                if (quorumReached) {
                    if (updated.votes_for >= majority) newStatus = 'approved';
                    else if (updated.votes_against >= majority) newStatus = 'rejected';
                }
                if (newStatus !== 'pending') {
                    supabase.from('proposals').update({ votes_for: updated.votes_for, votes_against: updated.votes_against, status: newStatus }).eq('id', proposalId).then(() => {});
                    // Write notification for all members
                    members.forEach(m => {
                        supabase.from('app_notifications').insert({
                            club_id: activeClub.id,
                            user_id: m.user_id,
                            type: 'VOTE_RESULT',
                            title: `Vote ${newStatus === 'approved' ? 'approuvé' : 'rejeté'} : ${p.ticker}`,
                            body: `La proposition ${p.type} ${p.quantity}× ${p.ticker} a été ${newStatus === 'approved' ? 'approuvée' : 'rejetée'}.`,
                        }).then(() => {});
                    });
                } else {
                    supabase.from('proposals').update({ votes_for: updated.votes_for, votes_against: updated.votes_against }).eq('id', proposalId).then(() => {});
                }
                return { ...updated, status: newStatus };
            });
            setProposals(newProposals);
            setMyVotes(prev => ({ ...prev, [proposalId]: vote }));
        } catch (e: any) {
            notify(e.message || 'Erreur lors du vote.');
        }
    };

    // --- PROPOSAL COMMENTS ---
    const handleLoadComments = async (proposalId: string) => {
        if (proposalComments[proposalId]) return; // already loaded
        const { data } = await supabase
            .from('proposal_comments')
            .select('*')
            .eq('proposal_id', proposalId)
            .order('created_at', { ascending: true });
        if (data) setProposalComments(prev => ({ ...prev, [proposalId]: data as ProposalComment[] }));
    };

    const handlePostComment = async (proposalId: string) => {
        if (!session || !activeClub || !currentUserMember) return;
        const content = (commentInputs[proposalId] || '').trim();
        if (!content) return;
        setIsPostingComment(true);
        const { data, error } = await supabase.from('proposal_comments').insert({
            proposal_id: proposalId,
            club_id: activeClub.id,
            user_id: session.user.id,
            user_name: currentUserMember.full_name,
            content,
        }).select().single();
        if (!error && data) {
            setProposalComments(prev => ({
                ...prev,
                [proposalId]: [...(prev[proposalId] || []), data as ProposalComment]
            }));
            setCommentInputs(prev => ({ ...prev, [proposalId]: '' }));
        }
        setIsPostingComment(false);
    };

    // --- AUDIT LOG ---
    const logAudit = async (action: string, details?: Record<string, any>) => {
        if (!activeClub || !session || !currentUserMember) return;
        await supabase.from('audit_log').insert({
            club_id: activeClub.id,
            user_id: session.user.id,
            user_name: currentUserMember.full_name,
            action,
            details: details || {},
        }).then(() => {});
    };

    const loadAuditLog = async (clubId: string) => {
        const { data } = await supabase
            .from('audit_log')
            .select('*')
            .eq('club_id', clubId)
            .order('created_at', { ascending: false })
            .limit(100);
        if (data) setAuditLog(data as AuditEntry[]);
    };

    // --- NOTIFICATIONS ---
    const loadNotifications = async () => {
        if (!session) return;
        const { data } = await supabase
            .from('app_notifications')
            .select('*')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(50);
        if (data) setAppNotifications(data as AppNotification[]);
    };

    const handleMarkAllRead = async () => {
        if (!session) return;
        await supabase.from('app_notifications')
            .update({ read: true })
            .eq('user_id', session.user.id)
            .eq('read', false);
        setAppNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    useEffect(() => {
        if (!session || !activeClub) return;
        loadNotifications();
        loadAuditLog(activeClub.id);
    }, [session?.user.id, activeClub?.id]);

    // --- EXPENSES ---
    const handleAddExpense = async () => {
        const amount = parseFloat(expenseForm.amount);
        if (!activeClub || isNaN(amount) || amount <= 0 || !expenseForm.description.trim()) {
            notify('Montant et description requis.', 'error');
            return;
        }
        setIsAddingExpense(true);
        try {
            await supabase.from('clubs').update({
                cash_balance: activeClub.cash_balance - amount
            }).eq('id', activeClub.id);
            await supabase.from('transactions').insert({
                club_id: activeClub.id,
                user_id: session?.user.id,
                type: 'EXPENSE',
                amount_fiat: amount,
                description: expenseForm.description.trim(),
            });
            await logAudit('EXPENSE', { amount, description: expenseForm.description });
            await loadClubData(activeClub.id);
            setExpenseForm({ amount: '', description: '' });
            notify(`Dépense de ${amount.toFixed(2)} € enregistrée.`);
        } catch (e: any) {
            notify(e.message, 'error');
        } finally {
            setIsAddingExpense(false);
        }
    };

    // --- QUORUM SETTING ---
    const handleUpdateQuorum = async () => {
        const pct = parseInt(quorumInput);
        if (!activeClub || isNaN(pct) || pct < 1 || pct > 100) {
            notify('Seuil invalide (1-100).', 'error');
            return;
        }
        await supabase.from('clubs').update({ quorum_pct: pct }).eq('id', activeClub.id);
        setActiveClub(prev => prev ? { ...prev, quorum_pct: pct } : prev);
        setQuorumInput('');
        notify(`Quorum mis à jour : ${pct}%`);
    };

    // --- REBALANCING TARGETS ---
    useEffect(() => {
        if (!activeClub) return;
        const stored = localStorage.getItem(`clubinvest_rebalancing_${activeClub.id}`);
        if (stored) { try { setRebalancingTargets(JSON.parse(stored)); } catch { /* ignore */ } }
    }, [activeClub?.id]);

    const handleSetTarget = (ticker: string, pct: number) => {
        const updated = { ...rebalancingTargets, [ticker]: pct };
        setRebalancingTargets(updated);
        if (activeClub) localStorage.setItem(`clubinvest_rebalancing_${activeClub.id}`, JSON.stringify(updated));
    };

    // --- DIVIDEND CREDIT ---
    const handleCreditDividend = async (dividend: DividendEntry) => {
        if (!activeClub || !session) return;
        const asset = assets.find(a => a.ticker === dividend.ticker);
        if (!asset) return;
        const totalAmount = dividend.amount * asset.quantity;
        const dateKey = dividend.date;
        // Check not already credited
        const alreadyCredited = transactions.some(t =>
            t.type === 'DIVIDEND' && t.asset_ticker === dividend.ticker &&
            t.created_at.startsWith(dateKey)
        );
        if (alreadyCredited) { notify('Dividende déjà crédité.', 'error'); return; }
        try {
            await supabase.from('clubs').update({ cash_balance: activeClub.cash_balance + totalAmount }).eq('id', activeClub.id);
            await supabase.from('transactions').insert({
                club_id: activeClub.id,
                user_id: session.user.id,
                type: 'DIVIDEND',
                amount_fiat: totalAmount,
                asset_ticker: dividend.ticker,
                description: `Dividende ${dividend.ticker} du ${new Date(dividend.date).toLocaleDateString('fr-FR')}`,
                created_at: dateKey + 'T12:00:00Z',
            });
            await logAudit('DIVIDEND', { ticker: dividend.ticker, amount: totalAmount, date: dateKey });
            await loadClubData(activeClub.id);
            notify(`+${totalAmount.toFixed(2)} ${dividend.currency} crédité (dividende ${dividend.ticker}).`);
        } catch (e: any) {
            notify(e.message, 'error');
        }
    };

    // --- DISSOLUTION ---
    const handleDissolve = async () => {
        if (!activeClub || !session) return;
        setIsDissolving(true);
        try {
            const { error: authErr } = await supabase.auth.signInWithPassword({
                email: session.user.email!,
                password: dissolutionPassword,
            });
            if (authErr) throw new Error('Mot de passe incorrect.');

            // Step 1: liquidate all assets at current prices
            for (const asset of assets) {
                const price = assetPrices[asset.ticker] || asset.avg_buy_price;
                const revenue = asset.quantity * price * convertCurrency(1, asset.currency, activeClub.currency);
                await supabase.from('transactions').insert({
                    club_id: activeClub.id,
                    user_id: session.user.id,
                    type: 'SELL',
                    amount_fiat: revenue,
                    asset_ticker: asset.ticker,
                    price_at_transaction: price,
                    description: 'Liquidation dissolution',
                });
                await supabase.from('assets').delete().eq('id', asset.id);
            }

            // Step 2: compute total cash after liquidation
            const liquidatedCash = assets.reduce((sum, a) => {
                const price = assetPrices[a.ticker] || a.avg_buy_price;
                return sum + a.quantity * price * convertCurrency(1, a.currency, activeClub.currency);
            }, activeClub.cash_balance);

            // Step 3: distribute pro-rata to each member
            const totalShares = activeClub.total_shares;
            for (const m of members) {
                if (m.shares_owned <= 0) continue;
                const share = totalShares > 0 ? (m.shares_owned / totalShares) * liquidatedCash : 0;
                await supabase.from('transactions').insert({
                    club_id: activeClub.id,
                    user_id: m.user_id,
                    type: 'WITHDRAWAL',
                    amount_fiat: share,
                    shares_change: -m.shares_owned,
                    description: 'Dissolution du club',
                });
                await supabase.from('club_members').update({ shares_owned: 0, total_invested_fiat: 0 }).eq('id', m.id);
            }

            // Step 4: mark club dissolved
            await supabase.from('clubs').update({
                status: 'dissolved',
                dissolved_at: new Date().toISOString(),
                cash_balance: 0,
                total_shares: 0,
            }).eq('id', activeClub.id);

            await logAudit('DISSOLUTION', { total_distributed: liquidatedCash });
            notify('Club dissous. Les données sont conservées en lecture seule.');
            setDissolutionStep(0);
            setDissolutionPassword('');
            await loadClubData(activeClub.id);
        } catch (e: any) {
            notify(e.message, 'error');
        } finally {
            setIsDissolving(false);
        }
    };

    // --- AUTO NAV SNAPSHOT (after financial events) ---
    const autoSnapshot = async (clubId: string, navPerShare: number, totalNetAssets: number) => {
        const today = new Date().toISOString().split('T')[0];
        // Only insert if no snapshot already exists for today
        const { data: existing } = await supabase
            .from('nav_history')
            .select('id')
            .eq('club_id', clubId)
            .eq('date', today)
            .maybeSingle();
        if (!existing) {
            await supabase.from('nav_history').insert({
                club_id: clubId,
                date: today,
                nav_per_share: parseFloat(navPerShare.toFixed(4)),
                total_net_assets: parseFloat(totalNetAssets.toFixed(2)),
            });
        }
    };

    // --- USER SETTINGS ---
    const handleSaveSettings = async () => {
        if (!session || !currentUserMember || !settingsName.trim()) return;
        setIsSavingSettings(true);
        try {
            await supabase.from('profiles').upsert({ id: session.user.id, full_name: settingsName.trim() });
            await supabase.from('club_members').update({ full_name: settingsName.trim() }).eq('user_id', session.user.id);
            setCurrentUserMember(m => m ? { ...m, full_name: settingsName.trim() } : m);
            notify('Profil mis à jour.');
        } catch {
            notify('Erreur lors de la mise à jour.', 'error');
        } finally {
            setIsSavingSettings(false);
        }
    };

    // --- TICKER AUTOCOMPLETE ---
    useEffect(() => {
        if (!tradeTicker || tradeTicker.length < 2) {
            setTickerSearchResults([]);
            setShowTickerDropdown(false);
            return;
        }
        const timeout = setTimeout(async () => {
            const results = await searchTickers(tradeTicker);
            setTickerSearchResults(results);
            setShowTickerDropdown(results.length > 0);
        }, 400);
        return () => clearTimeout(timeout);
    }, [tradeTicker]);

    const handleExecuteProposal = async (proposal: Proposal) => {
        if (!activeClub || !currentUserMember) return;
        setIsLoading(true);
        try {
            if (proposal.type === 'BUY') {
                const { updatedClub, updatedAssets, transaction } = executeBuyOrder(activeClub, assets, proposal.ticker, proposal.quantity, proposal.price, proposal.currency, currentUserMember);
                await supabase.from('clubs').update({ cash_balance: updatedClub.cash_balance }).eq('id', activeClub.id);
                const existingAsset = assets.find(a => a.ticker === proposal.ticker);
                const updatedAsset = updatedAssets.find(a => a.ticker === proposal.ticker)!;
                if (existingAsset) {
                    await supabase.from('assets').update({ quantity: updatedAsset.quantity, avg_buy_price: updatedAsset.avg_buy_price }).eq('id', existingAsset.id);
                } else {
                    await supabase.from('assets').insert({ club_id: activeClub.id, ticker: updatedAsset.ticker, quantity: updatedAsset.quantity, avg_buy_price: updatedAsset.avg_buy_price, currency: updatedAsset.currency });
                }
                await supabase.from('transactions').insert({ ...transaction, user_name: currentUserMember.full_name });
            } else {
                const { updatedClub, updatedAssets, transaction } = executeSellOrder(activeClub, assets, proposal.ticker, proposal.quantity, proposal.price, proposal.currency, currentUserMember);
                await supabase.from('clubs').update({ cash_balance: updatedClub.cash_balance, tax_liability: updatedClub.tax_liability }).eq('id', activeClub.id);
                const soldAsset = assets.find(a => a.ticker === proposal.ticker)!;
                const remaining = updatedAssets.find(a => a.ticker === proposal.ticker);
                if (remaining) {
                    await supabase.from('assets').update({ quantity: remaining.quantity }).eq('id', soldAsset.id);
                } else {
                    await supabase.from('assets').delete().eq('id', soldAsset.id);
                }
                await supabase.from('transactions').insert({ ...transaction, user_name: currentUserMember.full_name });
            }
            await supabase.from('proposals').update({ status: 'executed' }).eq('id', proposal.id);
            setProposals(prev => prev.map(p => p.id === proposal.id ? { ...p, status: 'executed' } : p));
            await loadClubData(activeClub.id);
            notify(`${proposal.type === 'BUY' ? 'Achat' : 'Vente'} de ${proposal.ticker} exécuté !`);
        } catch (e: any) {
            notify(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    // --- EXPORT CSV ---
    const handleExportCSV = () => {
        if (!activeClub) return;
        // Transactions sheet
        const txHeaders = ['Date', 'Type', 'Membre', 'Montant', 'Actif', 'Prix unitaire', 'Plus-value', 'Parts'];
        const txRows = transactions.map(t => [
            new Date(t.created_at).toLocaleDateString('fr-FR'),
            t.type,
            t.user_name || t.user_id || '',
            t.amount_fiat.toFixed(2),
            t.asset_ticker || '',
            t.price_at_transaction?.toFixed(2) || '',
            t.realized_gain?.toFixed(2) || '',
            t.shares_change?.toFixed(4) || ''
        ]);
        const txCSV = [txHeaders, ...txRows].map(r => r.map(v => `"${v}"`).join(';')).join('\n');

        // Member summary sheet
        const memHeaders = ['Membre', 'Rôle', 'Parts', 'Capital investi', 'Valeur actuelle', 'P&L', 'Dernière cotisation'];
        const memRows = members.map(m => {
            const val = memberValues[m.id] || 0;
            const last = memberLastDeposit[m.id];
            return [
                m.full_name || '',
                m.role,
                m.shares_owned.toFixed(4),
                m.total_invested_fiat.toFixed(2),
                val.toFixed(2),
                (val - m.total_invested_fiat).toFixed(2),
                last ? new Date(last).toLocaleDateString('fr-FR') : 'Jamais'
            ];
        });
        const memCSV = [memHeaders, ...memRows].map(r => r.map(v => `"${v}"`).join(';')).join('\n');

        const fullCSV = `TRANSACTIONS\n${txCSV}\n\nRÉCAPIT. MEMBRES\n${memCSV}`;
        const blob = new Blob(['\uFEFF' + fullCSV], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeClub.name}_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notify('Export CSV téléchargé.');
    };

    // --- PRICE ALERTS ---
    const handleAddAlert = () => {
        const price = parseFloat(alertForm.price);
        if (!alertForm.ticker.trim() || isNaN(price) || price <= 0) return;
        const newAlert: PriceAlert = {
            id: crypto.randomUUID(),
            ticker: alertForm.ticker.trim().toUpperCase(),
            targetPrice: price,
            direction: alertForm.direction,
            note: alertForm.note.trim(),
            triggered: false,
            createdAt: new Date().toISOString()
        };
        setPriceAlerts(prev => [newAlert, ...prev]);
        setAlertForm({ ticker: '', price: '', direction: 'above', note: '' });
        notify(`Alerte créée pour ${newAlert.ticker}.`);
    };

    const handleDeleteAlert = (id: string) => {
        setPriceAlerts(prev => prev.filter(a => a.id !== id));
    };

    // Request browser notification permission once user is in the app
    useEffect(() => {
        if (activeClub && 'Notification' in window && window.Notification.permission === 'default') {
            window.Notification.requestPermission();
        }
    }, [activeClub]);

    // Auto-scroll chat + track unread + push browser notification for new messages
    useEffect(() => {
        if (view === 'chat') {
            const el = document.getElementById('chat-messages');
            if (el) el.scrollTop = el.scrollHeight;
            setLastSeenMessageCount(messages.length);
        } else if (messages.length > 0) {
            // Show browser notification for new messages when not on chat view
            const latest = messages[messages.length - 1];
            if (
                'Notification' in window &&
                window.Notification.permission === 'granted' &&
                document.hidden &&
                latest.user_id !== session?.user?.id
            ) {
                new window.Notification(`💬 ${activeClub?.name}`, {
                    body: `${latest.user_name || 'Un membre'} : ${latest.content.slice(0, 80)}`,
                    icon: '/pwa-192x192.png',
                    tag: 'chat-message'
                });
            }
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


    // Load price alerts from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem('clubinvest_price_alerts');
        if (stored) { try { setPriceAlerts(JSON.parse(stored)); } catch { /* ignore */ } }
    }, []);

    // Save price alerts to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('clubinvest_price_alerts', JSON.stringify(priceAlerts));
    }, [priceAlerts]);

    // Check price alerts against live prices
    useEffect(() => {
        if (!Object.keys(assetPrices).length) return;
        setPriceAlerts(prev => prev.map(alert => {
            if (alert.triggered) return alert;
            const price = assetPrices[alert.ticker.toUpperCase()];
            if (!price) return alert;
            const hit = alert.direction === 'above' ? price >= alert.targetPrice : price <= alert.targetPrice;
            if (hit) {
                if ('Notification' in window && window.Notification.permission === 'granted') {
                    new window.Notification(`🎯 Alerte prix : ${alert.ticker}`, {
                        body: `${alert.ticker} à ${price.toFixed(2)} — cible ${alert.direction === 'above' ? '≥' : '≤'} ${alert.targetPrice}${alert.note ? ' · ' + alert.note : ''}`,
                        icon: '/pwa-192x192.png',
                        tag: `alert-${alert.ticker}`
                    });
                }
                notify(`🎯 ${alert.ticker} a atteint ${price.toFixed(2)} !`);
                return { ...alert, triggered: true };
            }
            return alert;
        }));
    }, [assetPrices]);

    // Load proposals when club changes
    useEffect(() => {
        if (!activeClub) { setProposals([]); setMyVotes({}); return; }
        const loadProposals = async () => {
            const { data: props } = await supabase
                .from('proposals')
                .select('*')
                .eq('club_id', activeClub.id)
                .order('created_at', { ascending: false });
            if (props) setProposals(props as Proposal[]);

            if (!session) return;
            const { data: votesData } = await supabase
                .from('votes')
                .select('proposal_id, vote')
                .eq('user_id', session.user.id);
            if (votesData) {
                const map: Record<string, 'for' | 'against'> = {};
                votesData.forEach(v => { map[v.proposal_id] = v.vote; });
                setMyVotes(map);
            }
        };
        loadProposals().catch(console.error);
    }, [activeClub, session]);

    // Load benchmark when symbol changes
    useEffect(() => {
        if (!benchmarkSymbol) { setBenchmarkData([]); return; }
        setIsFetchingBenchmark(true);
        fetchBenchmarkHistory(benchmarkSymbol)
            .then(data => setBenchmarkData(data))
            .catch(() => setBenchmarkData([]))
            .finally(() => setIsFetchingBenchmark(false));
    }, [benchmarkSymbol]);

    // Load dividends when portfolio assets change
    useEffect(() => {
        if (!assets.length) { setDividends([]); return; }
        Promise.all(assets.map(a => fetchDividendHistory(a.ticker)))
            .then(results => setDividends(results.flat().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())))
            .catch(() => {});
    }, [assets]);

    // --- DERIVED STATE (after all hooks) ---
    const unreadCount = view !== 'chat' ? Math.max(0, messages.length - lastSeenMessageCount) : 0;

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
            <div className="min-h-screen bg-[#0a0a0a] flex flex-col relative overflow-hidden animate-in fade-in duration-700">
                {/* Subtle radial glow */}
                <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(16,185,129,0.08) 0%, transparent 70%)' }} />

                {/* Top bar */}
                <div className="relative z-10 flex justify-between items-center px-6 py-5 md:px-12">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M3 21H21" stroke="#0a0a0a" strokeWidth="2.5" strokeLinecap="round"/>
                                <path d="M3 16L9 10L13 14L21 6" stroke="#0a0a0a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M21 6V10M21 6H17" stroke="#0a0a0a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                        <span className="font-bold text-white text-base tracking-tight">ClubInvest</span>
                    </div>
                    <button
                        onClick={() => { if (!session) setView('auth'); else if (!activeClub) setView('onboarding'); else setView('dashboard'); }}
                        className="text-sm font-semibold text-zinc-400 hover:text-white transition-colors"
                    >
                        Se connecter →
                    </button>
                </div>

                {/* Hero */}
                <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 py-16">
                    {/* Status pill */}
                    <div className="mb-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-emerald-400 text-xs font-semibold tracking-widest uppercase">Pour clubs d'investissement · France</span>
                    </div>

                    <h1 className="text-5xl sm:text-7xl md:text-8xl font-black text-white tracking-tighter leading-none mb-6">
                        Investissez<br />
                        <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)' }}>ensemble.</span>
                    </h1>

                    <p className="text-zinc-400 max-w-md mb-4 text-lg leading-relaxed">
                        La plateforme complète pour gérer votre club : quote-parts, portefeuille, votes, chat et analyses IA.
                    </p>
                    <p className="text-zinc-600 text-sm mb-12 max-w-sm">Report d'imposition · PFU 31,4 % calculé · Benchmark S&P 500 & CAC 40</p>

                    {/* Feature pills */}
                    <div className="flex flex-wrap justify-center gap-2 mb-12 max-w-lg">
                        {[
                            { icon: '📈', label: 'NAV en temps réel' },
                            { icon: '✨', label: 'Analyse IA Gemini' },
                            { icon: '🗳️', label: 'Votes & Propositions' },
                            { icon: '💬', label: 'Chat temps réel' },
                            { icon: '⚖️', label: 'Fiscalité automatique' },
                            { icon: '📊', label: 'Graphiques performance' },
                        ].map(f => (
                            <span key={f.label} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-xs font-medium text-zinc-400">
                                <span>{f.icon}</span>{f.label}
                            </span>
                        ))}
                    </div>

                    {/* CTA */}
                    <button
                        onClick={() => { if (!session) setView('auth'); else if (!activeClub) setView('onboarding'); else setView('dashboard'); }}
                        className="group relative px-10 py-4 rounded-full font-bold text-base bg-white text-black hover:bg-zinc-100 active:scale-95 transition-all shadow-2xl shadow-white/10"
                    >
                        Commencer gratuitement
                        <span className="ml-2 group-hover:translate-x-1 inline-block transition-transform">→</span>
                    </button>
                    <p className="mt-4 text-xs text-zinc-700">Gratuit · Aucune carte bancaire requise</p>
                </div>

                {/* Bottom footer */}
                <div className="relative z-10 border-t border-zinc-900 px-6 py-4 flex justify-between items-center">
                    <span className="text-zinc-700 text-xs">© 2025 ClubInvest</span>
                    <span className="text-zinc-700 text-xs">Données à titre indicatif · Pas de conseil financier</span>
                </div>
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
        { id: 'dashboard', label: 'Tableau de Bord', shortLabel: 'Accueil', icon: 'dashboard' },
        { id: 'portfolio', label: 'Portefeuille', shortLabel: 'Actifs', icon: 'pie' },
        { id: 'journal', label: 'Journal', shortLabel: 'Journal', icon: 'book' },
        { id: 'chat', label: 'Chat', shortLabel: 'Chat', icon: 'chat' },
        { id: 'votes', label: 'Votes', shortLabel: 'Votes', icon: 'vote' },
    ];

    const unreadNotifCount = appNotifications.filter(n => !n.read).length;

    return (
        <div className="font-sans transition-colors duration-500 min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 md:flex">

            {/* NOTIFICATION */}
            {notification && (
                <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />
            )}

            {/* PWA INSTALL BANNER */}
            <PWAInstallBanner />

            {/* NOTIFICATION PANEL */}
            {showNotifications && (
                <div className="fixed inset-0 z-[55] flex">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowNotifications(false)} />
                    <div className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-white dark:bg-slate-900 shadow-2xl flex flex-col z-10 border-l border-slate-200 dark:border-slate-800">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                            <h3 className="font-bold text-slate-900 dark:text-white">Notifications</h3>
                            <button onClick={() => setShowNotifications(false)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                                <Icon name="close" className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                            {appNotifications.length === 0 ? (
                                <div className="p-8 text-center text-slate-400">
                                    <Icon name="bell" className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                    <p className="text-sm">Aucune notification.</p>
                                </div>
                            ) : appNotifications.map(n => (
                                <div key={n.id} className={`p-4 ${n.read ? '' : 'bg-blue-50/50 dark:bg-blue-900/10'}`}>
                                    <div className="flex justify-between items-start gap-2">
                                        <div>
                                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{n.title}</p>
                                            {n.body && <p className="text-xs text-slate-500 mt-0.5">{n.body}</p>}
                                        </div>
                                        {!n.read && <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0 mt-1.5" />}
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-1">{new Date(n.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
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
                                <div className="relative">
                                    <Icon name={item.icon as any} className="w-5 h-5" />
                                    {item.id === 'chat' && unreadCount > 0 && (
                                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                                            {unreadCount > 9 ? '9+' : unreadCount}
                                        </span>
                                    )}
                                </div>
                                {item.label}
                            </button>
                        ))}
                        {/* Members + Guide in sidebar only */}
                        <button onClick={() => setView('members')} className={`w-full text-left px-4 py-3 text-sm font-semibold transition-all flex items-center gap-4 rounded-xl ${view === 'members' ? 'bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}>
                            <Icon name="users" className="w-5 h-5" />
                            Membres
                        </button>
                        <button onClick={() => setView('guide')} className={`w-full text-left px-4 py-3 text-sm font-semibold transition-all flex items-center gap-4 rounded-xl ${view === 'guide' ? 'bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}>
                            <Icon name="guide" className="w-5 h-5" />
                            Guide & Fiscalité
                        </button>
                        <button onClick={() => setView('analysis')} className={`w-full text-left px-4 py-3 text-sm font-semibold transition-all flex items-center gap-4 rounded-xl ${view === 'analysis' ? 'bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}>
                            <Icon name="pie" className="w-5 h-5" />
                            Analyse
                        </button>
                        <button onClick={() => { setShowNotifications(v => !v); handleMarkAllRead(); }} className={`w-full text-left px-4 py-3 text-sm font-semibold transition-all flex items-center gap-4 rounded-xl ${showNotifications ? 'bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}>
                            <div className="relative">
                                <Icon name="bell" className="w-5 h-5" />
                                {unreadNotifCount > 0 && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</span>}
                            </div>
                            Notifications
                        </button>
                        {isAdmin && (
                            <button onClick={() => setView('admin')} className={`w-full text-left px-4 py-3 text-sm font-semibold transition-all flex items-center gap-4 rounded-xl mt-6 ${view === 'admin' ? 'bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}>
                                <Icon name="settings" className="w-5 h-5" />
                                Admin
                            </button>
                        )}
                    </nav>
                </div>
                <div className="p-10 space-y-3">
                    <button onClick={() => setView('settings')} className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all hover:bg-slate-50 dark:hover:bg-slate-900/50 ${view === 'settings' ? 'bg-slate-100 dark:bg-slate-900' : ''}`}>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
                            {currentUserMember?.full_name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0 text-left">
                            <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{currentUserMember?.full_name}</div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{currentUserMember?.role === 'admin' ? 'Admin' : 'Membre'} · Mon profil</div>
                        </div>
                    </button>
                    <button onClick={() => setDarkMode(!darkMode)} className="flex items-center gap-3 text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors px-3">
                        <Icon name={darkMode ? 'sun' : 'moon'} className="w-5 h-5" />
                        {darkMode ? 'Mode Clair' : 'Mode Sombre'}
                    </button>
                    <button onClick={() => supabase.auth.signOut()} className="text-red-500 text-sm font-bold hover:text-red-600 transition-colors flex items-center gap-2 px-3">
                        <Icon name="logout" className="w-4 h-4" />
                        Se Déconnecter
                    </button>
                </div>
            </aside>

            {/* MOBILE TOP HEADER */}
            <header className="md:hidden fixed top-0 w-full z-40 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 h-14 flex justify-between items-center">
                <Logo className="w-auto h-7" onClick={() => setView('dashboard')} />
                <div className="flex items-center gap-0.5">
                    <button onClick={() => { setShowNotifications(v => !v); handleMarkAllRead(); }} className="relative p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400">
                        <Icon name="bell" className="w-5 h-5" />
                        {unreadNotifCount > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-black" />}
                    </button>
                    <button onClick={() => setView('settings')} className={`p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${view === 'settings' ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center text-[10px] font-bold text-slate-600 dark:text-slate-300">
                            {currentUserMember?.full_name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                    </button>
                </div>
            </header>

            {/* MOBILE "MORE" DRAWER */}
            {showMobileMore && (
                <div className="md:hidden fixed inset-0 z-[55] flex items-end">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowMobileMore(false)} />
                    <div className="relative w-full bg-white dark:bg-slate-900 rounded-t-3xl p-6 pb-8 z-10 border-t border-slate-200 dark:border-slate-800">
                        <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-6" />
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { id: 'members', label: 'Membres', icon: 'users' },
                                { id: 'analysis', label: 'Analyse', icon: 'pie' },
                                { id: 'guide', label: 'Guide', icon: 'guide' },
                                { id: 'settings', label: 'Mon Profil', icon: 'settings' },
                                ...(isAdmin ? [{ id: 'admin', label: 'Admin', icon: 'settings' }] : []),
                            ].map(item => (
                                <button key={item.id} onClick={() => { setView(item.id as ViewState); setShowMobileMore(false); }}
                                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl transition-all ${view === item.id ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
                                    <Icon name={item.icon as any} className="w-6 h-6" />
                                    <span className="text-[11px] font-bold">{item.label}</span>
                                </button>
                            ))}
                            <button onClick={() => { setDarkMode(v => !v); }} className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                <Icon name={darkMode ? 'sun' : 'moon'} className="w-6 h-6" />
                                <span className="text-[11px] font-bold">{darkMode ? 'Mode Clair' : 'Sombre'}</span>
                            </button>
                            <button onClick={() => supabase.auth.signOut()} className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-500">
                                <Icon name="logout" className="w-6 h-6" />
                                <span className="text-[11px] font-bold">Déconnexion</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MOBILE BOTTOM NAV */}
            <nav className="md:hidden fixed bottom-0 w-full z-50 bg-white/90 dark:bg-black/90 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 pb-safe">
                <div className="flex items-center px-2 py-1">
                    {menuItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => { setView(item.id as ViewState); setShowMobileMore(false); }}
                            className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all ${view === item.id ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-600'}`}
                        >
                            <div className="relative mb-0.5">
                                <Icon name={item.icon as any} className={`w-5 h-5 ${view === item.id ? 'stroke-[2.5px]' : ''}`} />
                                {item.id === 'chat' && unreadCount > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                                        {unreadCount > 9 ? '9+' : unreadCount}
                                    </span>
                                )}
                            </div>
                            <span className="text-[9px] font-bold leading-none">{item.shortLabel}</span>
                        </button>
                    ))}
                    <button onClick={() => setShowMobileMore(v => !v)}
                        className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all ${showMobileMore ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-600'}`}>
                        <Icon name="menu" className="w-5 h-5 mb-0.5" />
                        <span className="text-[9px] font-bold leading-none">Plus</span>
                    </button>
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
                                    <div className="flex items-center justify-center xl:justify-start gap-2">
                                        <p className="text-slate-500 dark:text-slate-400 uppercase text-xs font-bold tracking-widest">Actif Net Total</p>
                                        <button onClick={() => setBalanceHidden(v => !v)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors" title={balanceHidden ? 'Afficher' : 'Masquer'}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                {balanceHidden
                                                    ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                                                    : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                                                }
                                            </svg>
                                        </button>
                                    </div>
                                    <h1 className="text-5xl md:text-7xl font-black text-slate-900 dark:text-white leading-none tracking-tight">
                                        {balanceHidden ? <span className="tracking-widest opacity-30">••••••</span> : portfolioSummary.totalNetAssets.toLocaleString('fr-FR', { style: 'currency', currency: activeClub.currency })}
                                    </h1>
                                    <p className="text-slate-500 text-sm">
                                        Quote-part : <span className="font-bold text-slate-900 dark:text-white">{balanceHidden ? '••••' : `${portfolioSummary.navPerShare.toFixed(2)} ${activeClub.currency}`}</span>
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
                                {/* High Water Mark */}
                                <span className="text-slate-400 dark:text-slate-500 text-sm">
                                    HWM : <span className="font-bold text-slate-700 dark:text-slate-300">{highWaterMark.toFixed(2)} {activeClub.currency}</span>
                                </span>
                                {drawdown < 0 && (
                                    <Badge type="negative">Drawdown {drawdown.toFixed(2)}%</Badge>
                                )}
                                {/* Benchmark comparison */}
                                {benchmarkComparison && (
                                    <span className="text-slate-400 dark:text-slate-500 text-sm">
                                        vs <span className="font-bold">{benchmarkComparison.symbol}</span> :{' '}
                                        <span className={benchmarkComparison.clubReturn >= benchmarkComparison.benchReturn ? 'text-green-600 dark:text-green-400 font-bold' : 'text-red-500 font-bold'}>
                                            Club {benchmarkComparison.clubReturn >= 0 ? '+' : ''}{benchmarkComparison.clubReturn}%
                                        </span>
                                        {' / '}
                                        <span className="font-bold text-slate-600 dark:text-slate-400">
                                            {benchmarkComparison.symbol} {benchmarkComparison.benchReturn >= 0 ? '+' : ''}{benchmarkComparison.benchReturn}%
                                        </span>
                                    </span>
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
                            {(() => {
                                const firstNav = filteredHistory.length > 1 ? filteredHistory[0].nav_per_share : null;
                                const lastNav = filteredHistory.length > 1 ? filteredHistory[filteredHistory.length - 1].nav_per_share : null;
                                const perfPct = firstNav && lastNav && firstNav > 0 ? ((lastNav - firstNav) / firstNav) * 100 : null;
                                const isGain = perfPct === null || perfPct >= 0;
                                const chartColor = isGain ? '#10b981' : '#ef4444';
                                const tickColor = darkMode ? '#71717a' : '#6b7280';
                                return (
                                <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 md:p-8 shadow-sm">
                                    {/* Chart header: title + performance + controls */}
                                    <div className="flex flex-col gap-4 mb-6">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-bold text-base text-zinc-500 dark:text-zinc-400 uppercase tracking-widest text-[11px]">Performance du club</h3>
                                                    <button onClick={() => setHelpTopic('nav')} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 w-4 h-4 rounded-full border flex items-center justify-center border-current text-[10px]">?</button>
                                                </div>
                                                {perfPct !== null ? (
                                                    <div className="flex items-baseline gap-3">
                                                        <span className={`text-3xl font-black tabular-nums ${isGain ? 'text-emerald-500' : 'text-red-500'}`}>
                                                            {isGain ? '+' : ''}{perfPct.toFixed(2)}%
                                                        </span>
                                                        <span className={`text-sm font-semibold ${isGain ? 'text-emerald-400' : 'text-red-400'}`}>
                                                            {isGain ? '▲' : '▼'} sur la période
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <p className="text-2xl font-black text-zinc-300 dark:text-zinc-600">—</p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <div className="flex gap-1">
                                                    {(['SPY', '^FCHI'] as const).map(sym => (
                                                        <button key={sym} onClick={() => setBenchmarkSymbol(benchmarkSymbol === sym ? null : sym)}
                                                            className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${benchmarkSymbol === sym ? 'bg-indigo-600 text-white border-indigo-600' : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-zinc-400'}`}>
                                                            {isFetchingBenchmark && benchmarkSymbol === sym ? '...' : `vs ${sym === '^FCHI' ? 'CAC 40' : 'S&P 500'}`}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
                                                    {(['1J', '1S', '1M', '1A', 'MAX'] as TimeRange[]).map(r => (
                                                        <button
                                                            key={r}
                                                            onClick={() => setChartRange(r)}
                                                            className={`text-xs font-bold px-3 py-1.5 rounded-md transition-all ${chartRange === r ? 'bg-white dark:bg-zinc-600 shadow-sm text-zinc-900 dark:text-white' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'}`}
                                                        >
                                                            {r}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="h-[240px] md:h-[300px] w-full">
                                        {filteredHistory.length <= 1 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-2">
                                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-30">
                                                    <path d="M3 16L9 10L13 14L21 6" strokeLinecap="round" strokeLinejoin="round"/>
                                                </svg>
                                                <p className="text-sm">Aucun historique sur cette période.</p>
                                                {isAdmin && <p className="text-xs opacity-60">Effectuez un dépôt ou un achat pour générer un premier point.</p>}
                                            </div>
                                        ) : (
                                            <ResponsiveContainer>
                                                <AreaChart data={filteredHistory} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                                                    <defs>
                                                        <linearGradient id="colorNav" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor={chartColor} stopOpacity={0.25} />
                                                            <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={darkMode ? '#27272a' : '#f4f4f5'} />
                                                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: tickColor }}
                                                        tickFormatter={(val) => { const d = new Date(val); return `${d.getDate()}/${d.getMonth() + 1}`; }}
                                                        interval="preserveStartEnd" />
                                                    <YAxis hide={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: tickColor }} domain={['dataMin - 0.5', 'dataMax + 0.5']} width={48} tickFormatter={v => v.toFixed(0)} />
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: darkMode ? '#18181b' : '#ffffff', borderRadius: '12px', border: `1px solid ${darkMode ? '#3f3f46' : '#e4e4e7'}`, boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}
                                                        itemStyle={{ color: darkMode ? '#fff' : '#18181b', fontWeight: 700 }}
                                                        labelStyle={{ color: tickColor, fontSize: 11 }}
                                                        labelFormatter={(l: string) => new Date(l).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                        formatter={(value: number) => [`${value.toFixed(4)} ${activeClub.currency}`, 'Quote-part']}
                                                    />
                                                    <Area type="monotone" dataKey="nav_per_share" stroke={chartColor} fill="url(#colorNav)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: chartColor, strokeWidth: 0 }} />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>
                                </div>
                                );
                            })()}
                        </>
                    )}

                    {/* PORTFOLIO VIEW */}
                    {view === 'portfolio' && (
                        <div className="space-y-6">
                        {isLoadingData ? (
                            <Card className="p-0 overflow-hidden">
                                <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                                    <div className="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                                </div>
                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {[1,2,3].map(i => (
                                        <div key={i} className="p-5 flex justify-between items-center">
                                            <div className="space-y-2">
                                                <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                                                <div className="h-3 w-28 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                                            </div>
                                            <div className="space-y-2 text-right">
                                                <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                                                <div className="h-3 w-12 bg-slate-100 dark:bg-slate-800 rounded animate-pulse ml-auto" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        ) : (
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

                        {/* PRICE ALERTS */}
                        <Card>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><Icon name="bell" className="w-4 h-4" /> Alertes de Prix</h3>
                            </div>
                            <div className="grid md:grid-cols-4 gap-3 mb-4">
                                <Input placeholder="Ticker (ex: AAPL)" value={alertForm.ticker} onChange={e => setAlertForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))} />
                                <Input type="number" placeholder="Prix cible" value={alertForm.price} onChange={e => setAlertForm(f => ({ ...f, price: e.target.value }))} />
                                <select value={alertForm.direction} onChange={e => setAlertForm(f => ({ ...f, direction: e.target.value as 'above' | 'below' }))}
                                    className="bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 text-slate-900 dark:text-white border-none outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white text-sm font-medium">
                                    <option value="above">≥ au-dessus de</option>
                                    <option value="below">≤ en-dessous de</option>
                                </select>
                                <Button onClick={handleAddAlert} disabled={!alertForm.ticker || !alertForm.price} variant="secondary">+ Alerte</Button>
                            </div>
                            {priceAlerts.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-4">Aucune alerte configurée.</p>
                            ) : (
                                <div className="space-y-2">
                                    {priceAlerts.map(a => (
                                        <div key={a.id} className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm ${a.triggered ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900' : 'bg-slate-50 dark:bg-slate-800'}`}>
                                            <div className="flex items-center gap-3">
                                                <span className="font-mono font-bold text-slate-900 dark:text-white">{a.ticker}</span>
                                                <span className="text-slate-500">{a.direction === 'above' ? '≥' : '≤'} {a.targetPrice}</span>
                                                {a.note && <span className="text-slate-400 text-xs">{a.note}</span>}
                                                {a.triggered && <Badge type="positive">Déclenché</Badge>}
                                            </div>
                                            <button onClick={() => handleDeleteAlert(a.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                                                <Icon name="x" className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>

                        {/* DIVIDENDS */}
                        {dividends.length > 0 && (
                            <Card>
                                <h3 className="font-bold text-slate-900 dark:text-white mb-1">Historique Dividendes</h3>
                                <p className="text-xs text-slate-400 mb-4">Cliquez "Créditer" pour enregistrer un dividende reçu dans la trésorerie du club.</p>
                                <div className="space-y-2">
                                    {dividends.slice(0, 12).map((d, i) => {
                                        const asset = assets.find(a => a.ticker === d.ticker);
                                        const total = asset ? d.amount * asset.quantity : null;
                                        const alreadyCredited = transactions.some(t =>
                                            t.type === 'DIVIDEND' && t.asset_ticker === d.ticker && t.created_at.startsWith(d.date)
                                        );
                                        return (
                                            <div key={i} className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800 last:border-0 text-sm">
                                                <div className="flex items-center gap-3">
                                                    <span className="font-mono font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{d.ticker}</span>
                                                    <span className="text-slate-500">{new Date(d.date).toLocaleDateString('fr-FR')}</span>
                                                    {total && <span className="text-xs text-slate-400">×{asset?.quantity.toFixed(2)} = <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">+{total.toFixed(2)} {d.currency}</span></span>}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-slate-400 text-xs">{d.amount.toFixed(4)}/action</span>
                                                    {isAdmin && !alreadyCredited && total && (
                                                        <button onClick={() => handleCreditDividend(d)} className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded-lg font-bold hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors">
                                                            Créditer
                                                        </button>
                                                    )}
                                                    {alreadyCredited && <Badge type="positive">Crédité</Badge>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="text-xs text-slate-400 mt-3">Données Yahoo Finance — dividendes par action versés par les sociétés détenues.</p>
                            </Card>
                        )}
                        </div>
                    )}

                    {/* VOTES VIEW */}
                    {view === 'votes' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Votes & Propositions</h2>
                                    <p className="text-sm text-slate-500 mt-1">
                                        Majorité simple · Quorum : <span className="font-bold">{(activeClub as any).quorum_pct ?? 60}%</span> de participation requis
                                    </p>
                                </div>
                                <Button onClick={() => { setShowProposalForm(v => !v); setProposalError(null); }}>
                                    {showProposalForm ? 'Annuler' : '+ Proposer'}
                                </Button>
                            </div>

                            {/* Proposal form */}
                            {showProposalForm && (
                                <Card>
                                    <h3 className="font-bold text-slate-900 dark:text-white mb-4">Nouvelle proposition</h3>
                                    {proposalError && <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 text-sm rounded-xl mb-4">{proposalError}</div>}
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div className="flex gap-2">
                                            {(['BUY', 'SELL'] as const).map(t => (
                                                <button key={t} onClick={() => setProposalForm(f => ({ ...f, type: t }))}
                                                    className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all ${proposalForm.type === t ? (t === 'BUY' ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white') : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                                                    {t === 'BUY' ? 'Acheter' : 'Vendre'}
                                                </button>
                                            ))}
                                        </div>
                                        <Input placeholder="Ticker (ex: NVDA)" value={proposalForm.ticker} onChange={e => setProposalForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))} />
                                        <Input type="number" placeholder="Quantité" value={proposalForm.quantity} onChange={e => setProposalForm(f => ({ ...f, quantity: e.target.value }))} />
                                        <Input type="number" placeholder="Prix estimé" value={proposalForm.price} onChange={e => setProposalForm(f => ({ ...f, price: e.target.value }))} />
                                    </div>
                                    <textarea
                                        placeholder="Thèse d'investissement (obligatoire — pourquoi ce trade ?)"
                                        value={proposalForm.thesis}
                                        onChange={e => setProposalForm(f => ({ ...f, thesis: e.target.value }))}
                                        className="w-full mt-4 bg-slate-50 dark:bg-slate-800 rounded-2xl px-5 py-4 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-slate-900 dark:focus:ring-white outline-none text-sm resize-none h-24"
                                    />
                                    <div className="mt-4 flex justify-end">
                                        <Button onClick={handleSubmitProposal} disabled={isSubmittingProposal}>
                                            {isSubmittingProposal ? 'Envoi...' : 'Soumettre au vote'}
                                        </Button>
                                    </div>
                                </Card>
                            )}

                            {/* Proposals list */}
                            {proposals.length === 0 && !showProposalForm && (
                                <div className="text-center py-16 text-slate-400">
                                    <Icon name="vote" className="w-12 h-12 mx-auto mb-4 opacity-30" />
                                    <p className="font-medium">Aucune proposition en cours.</p>
                                    <p className="text-sm mt-1">Soumettez un trade pour que les membres votent.</p>
                                </div>
                            )}
                            {proposals.map(p => {
                                const total = members.length;
                                const majority = Math.floor(total / 2) + 1;
                                const myVote = myVotes[p.id];
                                const pct = total > 0 ? Math.round((p.votes_for / total) * 100) : 0;
                                const participation = total > 0 ? Math.round(((p.votes_for + p.votes_against) / total) * 100) : 0;
                                const quorumPct = (activeClub as any).quorum_pct ?? 60;
                                const quorumReached = participation >= quorumPct;
                                const statusColor = { pending: 'neutral', approved: 'positive', rejected: 'negative', executed: 'neutral' }[p.status] as 'positive' | 'negative' | 'neutral';
                                const statusLabel = { pending: 'En cours', approved: 'Approuvé', rejected: 'Rejeté', executed: 'Exécuté' }[p.status];
                                const isExpanded = expandedProposalId === p.id;
                                const comments = proposalComments[p.id] || [];
                                return (
                                    <Card key={p.id} className={p.status === 'executed' ? 'opacity-60' : ''}>
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <span className={`font-mono font-black text-xl ${p.type === 'BUY' ? 'text-emerald-600' : 'text-red-500'}`}>{p.type}</span>
                                                <span className="font-bold text-slate-900 dark:text-white text-lg">{p.quantity} × {p.ticker}</span>
                                                <span className="text-slate-400 text-sm">@ {p.price} {p.currency}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Badge type={statusColor}>{statusLabel}</Badge>
                                                {isAdmin && p.status === 'approved' && (
                                                    <Button variant="success" className="text-xs px-3 py-1.5 h-auto" disabled={isLoading}
                                                        onClick={() => {
                                                            if (window.confirm(`Exécuter ${p.type} ${p.quantity} × ${p.ticker} @ ${p.price} ${p.currency} ?`)) {
                                                                handleExecuteProposal(p);
                                                            }
                                                        }}>
                                                        Exécuter
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 italic">"{p.thesis}"</p>
                                        <div className="text-xs text-slate-400 mb-3 flex flex-wrap gap-2">
                                            <span>Par <span className="font-semibold text-slate-600 dark:text-slate-300">{p.proposer_name || 'un membre'}</span></span>
                                            <span>· Expire {new Date(p.expires_at).toLocaleDateString('fr-FR')}</span>
                                            <span>· {majority} votes requis / {total} membres</span>
                                            <span className={`font-semibold ${quorumReached ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                · Participation : {participation}% {quorumReached ? '✓' : `(min ${quorumPct}%)`}
                                            </span>
                                        </div>
                                        {/* Vote progress bar */}
                                        <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-3">
                                            <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <div className="flex gap-4 text-sm">
                                                <span className="text-emerald-600 font-bold">{p.votes_for} Pour</span>
                                                <span className="text-red-500 font-bold">{p.votes_against} Contre</span>
                                                <span className="text-slate-400">{total - p.votes_for - p.votes_against} abstentions</span>
                                            </div>
                                            {p.status === 'pending' && !myVote && (
                                                <div className="flex gap-2">
                                                    <Button variant="success" className="text-xs px-4 py-2 h-auto" onClick={() => handleVote(p.id, 'for')}>
                                                        <Icon name="check" className="w-3 h-3" /> Pour
                                                    </Button>
                                                    <Button variant="danger" className="text-xs px-4 py-2 h-auto" onClick={() => handleVote(p.id, 'against')}>
                                                        <Icon name="x" className="w-3 h-3" /> Contre
                                                    </Button>
                                                </div>
                                            )}
                                            {myVote && (
                                                <Badge type={myVote === 'for' ? 'positive' : 'negative'}>
                                                    Voté {myVote === 'for' ? 'Pour' : 'Contre'}
                                                </Badge>
                                            )}
                                        </div>
                                        {/* Comments toggle */}
                                        <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3">
                                            <button
                                                onClick={() => {
                                                    setExpandedProposalId(isExpanded ? null : p.id);
                                                    if (!isExpanded) handleLoadComments(p.id);
                                                }}
                                                className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white font-semibold flex items-center gap-1 transition-colors"
                                            >
                                                <Icon name="chat" className="w-3.5 h-3.5" />
                                                {isExpanded ? 'Masquer les commentaires' : `Commentaires${comments.length ? ` (${comments.length})` : ''}`}
                                            </button>
                                            {isExpanded && (
                                                <div className="mt-3 space-y-2">
                                                    {comments.length === 0 && <p className="text-xs text-slate-400 italic">Aucun commentaire. Soyez le premier à débattre !</p>}
                                                    {comments.map(c => (
                                                        <div key={c.id} className="flex gap-2 text-sm">
                                                            <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                                                                {(c.user_name || '?').charAt(0).toUpperCase()}
                                                            </div>
                                                            <div className="flex-1 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2">
                                                                <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs">{c.user_name || 'Membre'}</span>
                                                                <span className="text-slate-400 text-xs ml-2">{new Date(c.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                                                <p className="text-slate-700 dark:text-slate-300 mt-0.5">{c.content}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <div className="flex gap-2 mt-2">
                                                        <input
                                                            type="text"
                                                            placeholder="Ajouter un commentaire..."
                                                            value={commentInputs[p.id] || ''}
                                                            onChange={e => setCommentInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                                                            onKeyDown={e => { if (e.key === 'Enter') handlePostComment(p.id); }}
                                                            className="flex-1 text-sm px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border-none outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600 text-slate-900 dark:text-white placeholder-slate-400"
                                                        />
                                                        <Button variant="secondary" className="text-xs px-3 py-2 h-auto" onClick={() => handlePostComment(p.id)} disabled={isPostingComment || !commentInputs[p.id]?.trim()}>
                                                            ↑
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    )}

                    {/* MEMBERS VIEW */}
                    {view === 'members' && (
                        <>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-lg dark:text-white">{isLoadingData ? '...' : `${members.length} membre${members.length > 1 ? 's' : ''}`}</h3>
                                {isAdmin && <Button onClick={() => setModal({ type: 'addMember' })}>+ Membre</Button>}
                            </div>
                            {isLoadingData ? (
                                <Card className="p-0 overflow-hidden">
                                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {[1,2,3].map(i => (
                                            <div key={i} className="p-5 flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse shrink-0" />
                                                <div className="space-y-2 flex-1">
                                                    <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                                                    <div className="h-3 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                                                </div>
                                                <div className="space-y-2 text-right">
                                                    <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                                                    <div className="h-3 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse ml-auto" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            ) : (
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
                                    <Table headers={['Membre', 'Rôle', 'Parts', 'Investi', 'Valeur Actuelle', 'P&L', 'Cotisation', '']}>
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
                                                        {(() => {
                                                            const last = memberLastDeposit[m.id];
                                                            const daysSince = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
                                                            const overdue = daysSince === null || daysSince > 30;
                                                            return (
                                                                <span className={`text-xs font-medium ${overdue ? 'text-amber-500' : 'text-slate-400'}`}>
                                                                    {last ? `${daysSince}j` : 'Jamais'}
                                                                    {overdue && <span title="Pas de dépôt depuis plus de 30 jours"> ⚠️</span>}
                                                                </span>
                                                            );
                                                        })()}
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
                            )}
                        </>
                    )}

                    {/* JOURNAL VIEW */}
                    {view === 'journal' && (
                        <Card className="p-0 overflow-hidden">
                            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white">Journal des opérations</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">{transactions.length} opération{transactions.length > 1 ? 's' : ''}</p>
                                </div>
                                <Button variant="outline" className="text-xs px-3 py-2 h-auto gap-1.5" onClick={handleExportCSV} disabled={!transactions.length}>
                                    <Icon name="download" className="w-3.5 h-3.5" /> Export CSV
                                </Button>
                            </div>
                            {/* Filter bar */}
                            <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex gap-2 overflow-x-auto">
                                {(['ALL', 'DEPOSIT', 'WITHDRAWAL', 'BUY', 'SELL', 'DIVIDEND', 'EXPENSE'] as const).map(f => (
                                    <button key={f} onClick={() => setJournalFilter(f)}
                                        className={`text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap transition-all ${journalFilter === f ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
                                        {f === 'ALL' ? 'Tout' : f}
                                    </button>
                                ))}
                            </div>
                            {transactions.length === 0 && (
                                <div className="p-12 text-center text-slate-400 text-sm">Aucune opération enregistrée.</div>
                            )}
                            {(() => {
                                const filtered = journalFilter === 'ALL' ? transactions : transactions.filter(t => t.type === journalFilter);
                                if (transactions.length > 0 && filtered.length === 0) {
                                    return <div className="p-8 text-center text-slate-400 text-sm">Aucune opération de ce type.</div>;
                                }
                                return (
                                    <>
                                        {/* Mobile */}
                                        <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                                            {filtered.map(t => {
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
                                                {filtered.map(t => {
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
                                    </>
                                );
                            })()}
                        </Card>
                    )}

                    {/* CHAT VIEW */}
                    {view === 'chat' && (
                        <div className="flex flex-col h-[calc(100vh-260px)] md:h-[calc(100vh-160px)] max-h-[720px] bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">

                            {/* Header */}
                            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white">Chat du club</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">{members.length > 0 ? `${members.length} membre${members.length > 1 ? 's' : ''}` : activeClub?.name ?? ''} · temps réel</p>
                                </div>
                                {isAdmin && (
                                    <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 rounded-full font-semibold">
                                        Admin · Annonces activées
                                    </span>
                                )}
                            </div>

                            {/* Announcements pinned */}
                            {messages.filter(m => m.type === 'announcement').length > 0 && (
                                <div className="px-4 pt-3 space-y-2 shrink-0">
                                    {messages.filter(m => m.type === 'announcement').slice(-2).map(a => {
                                        const authorName = members.find(mb => mb.user_id === a.user_id)?.full_name || 'Admin';
                                        return (
                                            <div key={a.id} className="flex items-start gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl">
                                                <span className="shrink-0 mt-0.5">📣</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                                        <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Annonce</span>
                                                        <span className="text-[11px] text-slate-400">{authorName} · {new Date(a.created_at).toLocaleDateString('fr-FR')}</span>
                                                    </div>
                                                    <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">{a.content}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Messages list */}
                            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" id="chat-messages">
                                {messages.filter(m => m.type === 'message').length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                                        <Icon name="chat" className="w-8 h-8 opacity-30" />
                                        <p className="text-sm">Pas encore de messages.</p>
                                        <p className="text-xs text-slate-300 dark:text-slate-600">Dites bonjour au club !</p>
                                    </div>
                                )}
                                {messages.filter(m => m.type === 'message').map(msg => {
                                    const isMe = msg.user_id === session?.user.id;
                                    const authorName = msg.user_name || members.find(mb => mb.user_id === msg.user_id)?.full_name || 'Membre';
                                    const initials = authorName.charAt(0).toUpperCase();
                                    return (
                                        <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                            {!isMe && (
                                                <div className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                                                    {initials}
                                                </div>
                                            )}
                                            <div className={`max-w-[72%] flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
                                                {!isMe && <span className="text-[11px] text-slate-400 px-3">{authorName}</span>}
                                                <div className={`px-4 py-2.5 text-sm leading-relaxed ${isMe
                                                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl rounded-br-sm'
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-2xl rounded-bl-sm'
                                                }`}>
                                                    {msg.content}
                                                </div>
                                                <span className="text-[10px] text-slate-300 dark:text-slate-600 px-3">
                                                    {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Input bar */}
                            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                                <div className="flex gap-2 items-end">
                                    <textarea
                                        value={chatInput}
                                        onChange={e => setChatInput(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSendMessage('message');
                                            }
                                        }}
                                        placeholder="Écrire un message... (Entrée pour envoyer)"
                                        rows={1}
                                        className="flex-1 px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border-none outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white resize-none text-sm"
                                    />
                                    <Button
                                        onClick={() => handleSendMessage('message')}
                                        disabled={isSendingMessage || !chatInput.trim()}
                                        className="h-11 px-5 shrink-0"
                                    >
                                        {isSendingMessage ? '...' : '↑'}
                                    </Button>
                                    {isAdmin && (
                                        <Button
                                            variant="outline"
                                            onClick={() => handleSendMessage('announcement')}
                                            disabled={isSendingMessage || !chatInput.trim()}
                                            className="h-11 px-4 shrink-0 text-amber-600 border-amber-200 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                                        >
                                            📣
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ANALYSIS VIEW */}
                    {view === 'analysis' && (
                        <PortfolioAnalysis
                            assets={assets}
                            assetPrices={assetPrices}
                            navHistory={navHistory}
                            clubCurrency={activeClub.currency}
                            cashBalance={activeClub.cash_balance}
                            darkMode={darkMode}
                        />
                    )}

                    {/* GUIDE VIEW */}
                    {view === 'guide' && <GuideView />}

                    {/* SETTINGS VIEW */}
                    {view === 'settings' && (
                        <div className="space-y-6 max-w-lg">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Mon Profil</h2>
                                <p className="text-sm text-slate-500 mt-1">Gérez vos informations personnelles.</p>
                            </div>

                            {/* Profile card */}
                            <Card>
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-2xl font-black text-white">
                                        {currentUserMember?.full_name?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                    <div>
                                        <div className="font-bold text-lg text-slate-900 dark:text-white">{currentUserMember?.full_name}</div>
                                        <div className="text-xs text-slate-400 font-mono">{session?.user.email}</div>
                                        <Badge type={currentUserMember?.role === 'admin' ? 'positive' : 'neutral'} className="mt-1">
                                            {currentUserMember?.role === 'admin' ? 'Admin' : 'Membre'}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Nom affiché</label>
                                    <Input
                                        type="text"
                                        placeholder="Votre nom"
                                        value={settingsName || currentUserMember?.full_name || ''}
                                        onChange={e => setSettingsName(e.target.value)}
                                    />
                                    <Button variant="primary" onClick={handleSaveSettings} disabled={isSavingSettings || !settingsName.trim()}>
                                        {isSavingSettings ? 'Enregistrement...' : 'Enregistrer'}
                                    </Button>
                                </div>
                            </Card>

                            {/* Club membership summary */}
                            <Card>
                                <h3 className="font-bold text-slate-900 dark:text-white mb-4">Ma présence dans le club</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center py-3 border-b border-slate-100 dark:border-slate-800">
                                        <span className="text-sm text-slate-500">Club</span>
                                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{activeClub?.name}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-3 border-b border-slate-100 dark:border-slate-800">
                                        <span className="text-sm text-slate-500">Membre depuis</span>
                                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                            {currentUserMember?.joined_at ? new Date(currentUserMember.joined_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center py-3 border-b border-slate-100 dark:border-slate-800">
                                        <span className="text-sm text-slate-500">Parts détenues</span>
                                        <span className="text-sm font-semibold font-mono text-slate-900 dark:text-white">{currentUserMember?.shares_owned?.toFixed(4) || '0'}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-3 border-b border-slate-100 dark:border-slate-800">
                                        <span className="text-sm text-slate-500">Total investi</span>
                                        <span className="text-sm font-semibold font-mono text-slate-900 dark:text-white">{currentUserMember?.total_invested_fiat?.toFixed(2) || '0'} {activeClub?.currency}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-3">
                                        <span className="text-sm text-slate-500">Valeur actuelle des parts</span>
                                        <span className="text-sm font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                                            {activeClub && currentUserMember
                                                ? ((currentUserMember.shares_owned || 0) * (activeClub.total_shares > 0
                                                    ? (activeClub.cash_balance + assets.reduce((s, a) => s + (assetPrices[a.ticker] || a.avg_buy_price) * a.quantity * convertCurrency(1, a.currency, activeClub.currency), 0) - activeClub.tax_liability) / activeClub.total_shares
                                                    : 100)).toFixed(2)
                                                : '0'} {activeClub?.currency}
                                        </span>
                                    </div>
                                </div>
                            </Card>

                            {/* Activity history */}
                            <Card>
                                <h3 className="font-bold text-slate-900 dark:text-white mb-4">Mes dernières opérations</h3>
                                {transactions.filter(t => t.user_id === session?.user.id).length === 0 ? (
                                    <p className="text-sm text-slate-400 text-center py-4">Aucune opération personnelle.</p>
                                ) : (
                                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {transactions.filter(t => t.user_id === session?.user.id).slice(0, 10).map(t => (
                                            <div key={t.id} className="py-3 flex justify-between items-center">
                                                <div>
                                                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{t.type} {t.asset_ticker ? `· ${t.asset_ticker}` : ''}</div>
                                                    <div className="text-xs text-slate-400">{new Date(t.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                                </div>
                                                <span className={`text-sm font-mono font-bold ${t.type === 'DEPOSIT' || t.type === 'DIVIDEND' ? 'text-emerald-500' : t.type === 'WITHDRAWAL' ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>
                                                    {t.type === 'DEPOSIT' || t.type === 'DIVIDEND' ? '+' : t.type === 'WITHDRAWAL' ? '−' : ''}{t.amount_fiat?.toFixed(2)} {activeClub?.currency}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Card>

                            {/* Theme toggle */}
                            <Card>
                                <h3 className="font-bold text-slate-900 dark:text-white mb-4">Préférences</h3>
                                <button onClick={() => setDarkMode(!darkMode)} className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-3">
                                        <Icon name={darkMode ? 'moon' : 'sun'} className="w-5 h-5 text-slate-500" />
                                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Thème {darkMode ? 'sombre' : 'clair'} actif</span>
                                    </div>
                                    <div className={`w-10 h-6 rounded-full transition-colors ${darkMode ? 'bg-slate-900' : 'bg-slate-200'} flex items-center px-1`}>
                                        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${darkMode ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </div>
                                </button>
                            </Card>

                            <Button variant="danger" onClick={() => supabase.auth.signOut()} className="w-full">
                                <Icon name="logout" className="w-4 h-4" />
                                Se déconnecter
                            </Button>
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

                            {/* Quorum setting */}
                            <Card>
                                <h3 className="font-bold mb-2 text-slate-900 dark:text-white">Seuil de Quorum</h3>
                                <p className="text-sm text-slate-500 mb-4">
                                    Participation minimale requise pour qu'un vote soit valide. Actuellement : <span className="font-bold text-slate-900 dark:text-white">{(activeClub as any).quorum_pct ?? 60}%</span>
                                </p>
                                <div className="flex gap-3">
                                    <Input
                                        type="number"
                                        placeholder="Ex: 60"
                                        value={quorumInput}
                                        onChange={e => setQuorumInput(e.target.value)}
                                        min="1" max="100"
                                        className="max-w-[120px]"
                                    />
                                    <Button variant="secondary" onClick={handleUpdateQuorum} disabled={!quorumInput}>
                                        Mettre à jour
                                    </Button>
                                </div>
                            </Card>

                            {/* Freeze NAV */}
                            <Card>
                                <h3 className="font-bold mb-2 text-slate-900 dark:text-white">Figer la Quote-part</h3>
                                <p className="text-sm text-slate-500 mb-4">Enregistre un point dans l'historique avec la NAV actuelle ({portfolioSummary.navPerShare.toFixed(2)} {activeClub.currency}). À faire régulièrement (mensuel recommandé).</p>
                                <Button onClick={handleFreeze} disabled={isLoading} variant={freezeSuccess ? 'success' : 'primary'}>
                                    {isLoading ? 'Enregistrement...' : freezeSuccess ? '✓ Figée !' : 'Figer la Quote-part'}
                                </Button>
                            </Card>

                            {/* Expenses */}
                            <Card>
                                <h3 className="font-bold mb-2 text-slate-900 dark:text-white">Enregistrer une Dépense</h3>
                                <p className="text-sm text-slate-500 mb-4">Frais de courtage, abonnements, frais de tenue de compte — déduits du cash.</p>
                                <div className="grid md:grid-cols-3 gap-3">
                                    <div className="relative">
                                        <Input type="number" placeholder="Montant" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} min="0" step="0.01" />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">{activeClub.currency}</span>
                                    </div>
                                    <Input placeholder="Description (ex: Frais IB)" value={expenseForm.description} onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))} className="md:col-span-1" />
                                    <Button variant="secondary" onClick={handleAddExpense} disabled={isAddingExpense || !expenseForm.amount || !expenseForm.description}>
                                        {isAddingExpense ? '...' : '+ Dépense'}
                                    </Button>
                                </div>
                            </Card>

                            {/* Audit log */}
                            <Card className="p-0 overflow-hidden">
                                <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                                    <h3 className="font-bold text-slate-900 dark:text-white">Journal d'Audit</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">Historique des actions administratives.</p>
                                </div>
                                {auditLog.length === 0 ? (
                                    <p className="text-sm text-slate-400 text-center py-8">Aucune entrée d'audit.</p>
                                ) : (
                                    <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                                        {auditLog.map(entry => (
                                            <div key={entry.id} className="px-6 py-3 flex justify-between items-center text-sm">
                                                <div>
                                                    <span className="font-mono font-bold text-slate-900 dark:text-white text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded mr-2">{entry.action}</span>
                                                    <span className="text-slate-500">{entry.user_name || '—'}</span>
                                                </div>
                                                <span className="text-xs text-slate-400">{new Date(entry.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Card>

                            {/* Danger zone */}
                            <Card className="border border-red-100 dark:border-red-900/40">
                                <h3 className="font-bold mb-2 text-red-600 dark:text-red-400">Zone dangereuse</h3>
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-sm text-slate-500 mb-3">
                                            Réinitialise toutes les données financières du club. Les membres restent dans le club. Action irréversible.
                                        </p>
                                        <Button variant="danger" onClick={() => { setResetError(null); setResetPassword(''); setModal({ type: 'resetClub' }); }}>
                                            Réinitialiser le club
                                        </Button>
                                    </div>
                                    <div className="border-t border-red-100 dark:border-red-900/30 pt-3">
                                        <p className="text-sm text-slate-500 mb-3">
                                            <strong className="text-red-600 dark:text-red-400">Dissoudre le club</strong> — liquide tous les actifs, distribue le cash aux membres pro-rata, archive le club définitivement.
                                        </p>
                                        {dissolutionStep === 0 ? (
                                            <Button variant="danger" onClick={() => setDissolutionStep(1)}>
                                                Dissoudre le club
                                            </Button>
                                        ) : (
                                            <div className="space-y-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-200 dark:border-red-800">
                                                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Confirmation requise — cette action est irréversible.</p>
                                                <p className="text-xs text-red-600 dark:text-red-400">
                                                    Cash total à distribuer : <span className="font-mono font-bold">
                                                        {(activeClub.cash_balance + assets.reduce((s, a) => s + a.quantity * (assetPrices[a.ticker] || a.avg_buy_price) * convertCurrency(1, a.currency, activeClub.currency), 0)).toFixed(2)} {activeClub.currency}
                                                    </span>
                                                </p>
                                                <Input type="password" placeholder="Mot de passe pour confirmer" value={dissolutionPassword} onChange={e => setDissolutionPassword(e.target.value)} />
                                                <div className="flex gap-2">
                                                    <Button variant="outline" onClick={() => { setDissolutionStep(0); setDissolutionPassword(''); }}>Annuler</Button>
                                                    <Button variant="danger" onClick={handleDissolve} disabled={isDissolving || !dissolutionPassword}>
                                                        {isDissolving ? 'Dissolution...' : 'Confirmer la dissolution'}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
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
                    {/* Annual contribution limit indicator */}
                    {depositMemberId && depositMemberId !== 'ALL' && (() => {
                        const m = members.find(mem => mem.id === depositMemberId);
                        if (!m) return null;
                        const year = new Date().getFullYear();
                        const annualTotal = transactions
                            .filter(t => t.type === 'DEPOSIT' && t.user_id === m.user_id && new Date(t.created_at).getFullYear() === year)
                            .reduce((sum, t) => sum + t.amount_fiat, 0);
                        const cap = 5500;
                        const pct = Math.min(100, (annualTotal / cap) * 100);
                        const isOver = annualTotal >= cap;
                        const isWarning = pct >= 80;
                        return (
                            <div className={`p-3 rounded-xl text-xs border ${isOver ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400' : isWarning ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}>
                                <div className="flex justify-between mb-1.5">
                                    <span>Versements {year} ({m.full_name.split(' ')[0]})</span>
                                    <span className="font-mono font-bold">{annualTotal.toFixed(0)} € / {cap} €</span>
                                </div>
                                <div className="h-1.5 bg-white/50 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                                </div>
                                {isOver && <p className="mt-1 font-semibold">⚠️ Plafond BOFIP atteint pour {year}.</p>}
                            </div>
                        );
                    })()}
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

                    {/* Confirm step overlay */}
                    {tradeConfirmStep ? (
                        <>
                            <div className={`p-4 rounded-2xl border ${tradeType === 'BUY' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Confirmer l'ordre ?</p>
                                <div className="space-y-1 text-sm font-mono">
                                    <div className="flex justify-between"><span className="text-slate-500">Type</span><span className="font-bold">{tradeType === 'BUY' ? 'ACHAT' : 'VENTE'}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Actif</span><span className="font-bold">{tradeTicker}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Quantité</span><span className="font-bold">{tradeQty}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Prix unitaire</span><span className="font-bold">{parseFloat(tradePrice).toFixed(2)} {tradeCurrency}</span></div>
                                    <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 mt-1"><span className="text-slate-500">Total</span>
                                        <span className="font-bold">{(parseFloat(tradeQty) * parseFloat(tradePrice)).toFixed(2)} {tradeCurrency}
                                            {tradeCurrency !== activeClub.currency && ` ≈ ${(parseFloat(tradeQty) * parseFloat(tradePrice) * convertCurrency(1, tradeCurrency, activeClub.currency)).toFixed(2)} ${activeClub.currency}`}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <Button variant="outline" className="flex-1" onClick={() => setTradeConfirmStep(false)}>Modifier</Button>
                                <Button variant={tradeType === 'BUY' ? 'success' : 'danger'} className="flex-1" onClick={handleTrade} disabled={isLoading}>
                                    {isLoading ? 'Exécution...' : `Confirmer`}
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            {tradeType === 'BUY' && (
                                <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-xs text-zinc-500">
                                    Cash disponible : <span className="font-mono font-bold text-zinc-900 dark:text-white">{activeClub.cash_balance.toFixed(2)} {activeClub.currency}</span>
                                </div>
                            )}

                            {/* Popular instruments quick-pick */}
                            {!tradeTicker && (
                                <div className="space-y-2">
                                    <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Accès rapide</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {POPULAR_INSTRUMENTS.map(inst => (
                                            <button
                                                key={inst.ticker}
                                                onClick={() => { setTradeTicker(inst.ticker); setTradeCurrency(inst.currency); }}
                                                className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-400 border border-zinc-200 dark:border-zinc-700 hover:border-emerald-200 dark:hover:border-emerald-800/60 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition-all active:scale-95"
                                            >
                                                {inst.ticker}
                                                <span className="text-zinc-400 font-normal ml-1">· {inst.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-2">
                                <div className="flex-1">
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

                            <Input
                                type="number"
                                placeholder="Quantité"
                                value={tradeQty}
                                onChange={e => setTradeQty(e.target.value)}
                                min="0"
                                step="0.0001"
                            />

                            <div className="flex gap-2">
                                <div className="flex-1 relative">
                                    <Input
                                        type="number"
                                        placeholder="Prix unitaire"
                                        value={isFetchingTradePrice ? '' : tradePrice}
                                        onChange={e => setTradePrice(e.target.value)}
                                        min="0"
                                        step="0.01"
                                    />
                                    {isFetchingTradePrice && (
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400 animate-pulse">Chargement...</span>
                                    )}
                                </div>
                                <Button variant="outline" className="shrink-0 px-3 text-xs h-auto" onClick={handleFetchTradePrice} disabled={!tradeTicker.trim() || isFetchingTradePrice}>
                                    {isFetchingTradePrice ? '...' : 'Prix live'}
                                </Button>
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
                                {tradeType === 'BUY' ? 'Acheter →' : 'Vendre →'}
                            </Button>
                        </>
                    )}
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

            {/* RESET CLUB */}
            <Modal isOpen={modal.type === 'resetClub'} onClose={closeModal} title="Réinitialiser le Club">
                <div className="space-y-4">
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-100 dark:border-red-900/40">
                        <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">Cette action est irréversible.</p>
                        <ul className="text-xs text-red-600 dark:text-red-400 space-y-1 list-disc list-inside">
                            <li>Tous les dépôts et retraits sont effacés</li>
                            <li>Tous les actifs et ordres sont supprimés</li>
                            <li>L'historique de NAV est effacé</li>
                            <li>Les parts de chaque membre sont remises à 0</li>
                            <li>Les membres restent dans le club</li>
                        </ul>
                    </div>
                    {resetError && <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl">{resetError}</div>}
                    <div>
                        <p className="text-xs text-slate-500 mb-2 font-semibold">Entrez votre mot de passe pour confirmer</p>
                        <Input
                            type="password"
                            placeholder="Mot de passe"
                            value={resetPassword}
                            onChange={e => setResetPassword(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={closeModal}>Annuler</Button>
                        <Button variant="danger" className="flex-1" onClick={handleResetClub} disabled={isResetting || !resetPassword}>
                            {isResetting ? 'Réinitialisation...' : 'Confirmer la réinitialisation'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
