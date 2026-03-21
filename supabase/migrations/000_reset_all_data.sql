-- ============================================================
-- RESET COMPLET — À exécuter dans Supabase SQL Editor
-- Supprime TOUTES les données utilisateurs et clubs.
-- ⚠️  IRRÉVERSIBLE — ne pas lancer en production par erreur.
-- ============================================================

-- Données applicatives (ordre respectant les FK — dépendants d'abord)
DELETE FROM app_notifications;
DELETE FROM audit_log;
DELETE FROM proposal_comments;
DELETE FROM votes;
DELETE FROM proposals;
DELETE FROM price_alerts_db;
DELETE FROM messages;
DELETE FROM nav_history;
DELETE FROM transactions;
DELETE FROM assets;
DELETE FROM asset_prices;
DELETE FROM ticker_metadata;
DELETE FROM club_members;
DELETE FROM clubs;

-- Profils et comptes auth
DELETE FROM profiles;
DELETE FROM auth.users;
