import { createClient } from '@supabase/supabase-js';

// --- REMPLACE CES DEUX LIGNES PAR TES VRAIES INFOS SUPABASE ---
// Tu les trouves dans Supabase > Settings > API
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
// --------------------------------------------------------------

console.log("INITIALISATION SUPABASE AVEC :");
console.log("URL:", supabaseUrl);
// On n'affiche pas toute la clé par sécurité, juste pour voir si elle est là
console.log("Key (taille):", supabaseKey.length); 

export const supabase = createClient(supabaseUrl, supabaseKey);