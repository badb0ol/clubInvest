ClubInvest est une application minimaliste pour les clubs d'investissement modernes.

ClubInvest simplifie la gestion des clubs d'investissement en automatisant les calculs complexes de Quote-part (NAV), le suivi des actifs en temps réel et la gestion des membres. Conçu avec une approche mobile-first et une esthétique "Dark Mode" inspirée d'Apple. 

Fonctionnalités Clés :
- Tableau de Bord Premium avec une visualisation de la performance globale et de la Valeur Liquidative (NAV) en temps réel.
- Suivi Multi-Actifs via l'intégration de l'API Twelve Data pour des prix de marché actualisés.
- Gestion des Membres par un système d'invitation avec code unique et rôles (Admin/Membre).
- Transactions Intelligentes via des dépôts individuels ou groupés avec calcul automatique des parts créées.
- Analyse AI (Gemini) : Analyse de la répartition du portefeuille et conseils stratégiques intégrés.
- Expérience PWA installable sur iPhone/Android avec une interface plein écran sans barre d'URL.

Tech Stack -
Frontend : React 19 + TypeScript + Vite
Styling : Tailwind CSS (Finition Apple Dark) 
Backend/DBSupabase : (PostgreSQL + Realtime)
Authentification : Supabase Auth (Email & implementation à venir de Google OAuth)
Graphiques : Recharts (Courbes lissées)
API Finance : Twelve Data API
IA : Google Gemini Pro 3.0 

Installation Rapide Cloner le projet :

git clone https://github.com/votre-username/clubinvest.git
cd clubinvest

Installer les dépendances :

npm install

Configuration des variables d'environnement : Créez un fichier .env à la racine :

VITE_SUPABASE_URL=votre_url_supabase
VITE_SUPABASE_ANON_KEY=votre_cle_anon
VITE_TWELVE_DATA_API_KEY=votre_cle_twelve_data
VITE_GEMINI_API_KEY=votre_cle_google_gemini

Lancer en local :

npm run dev

Architecture & Sécurité 
L'application utilise des politiques de sécurité RLS (Row Level Security) strictes sur Supabase pour garantir que :
- Les membres ne voient que les données de leur propre club.
- Seuls les Admins peuvent valider des transactions ou modifier les paramètres du club.
- La création de profil utilisateur est automatisée via des Triggers SQL sécurisés.

Distribué sous la licence MIT. Voir LICENSE pour plus d'informations.
