-- ============================================================
-- Migration 011 : Rôle créateur de club
-- Ajoute is_creator sur club_members pour distinguer
-- le fondateur du club des simples admins.
-- Seul le créateur peut promouvoir/rétrograder d'autres admins.
-- ============================================================

ALTER TABLE club_members
  ADD COLUMN IF NOT EXISTS is_creator boolean NOT NULL DEFAULT false;

-- RLS : helpers existants (is_club_admin, is_club_member) restent valides.
-- On ajoute un helper is_club_creator pour les politiques futures.
CREATE OR REPLACE FUNCTION is_club_creator(p_club_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM club_members
    WHERE club_id = p_club_id
      AND user_id = auth.uid()
      AND is_creator = true
  );
$$;

-- Politique : seul le créateur peut changer le rôle d'un membre
-- (UPDATE sur la colonne role de club_members)
-- La politique "Admins update members" existante couvre déjà les UPDATE
-- généraux ; on n'override pas pour ne pas casser l'existant.
-- La contrainte est gérée côté app (isCreator gate).
