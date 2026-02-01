import { createClient } from '@supabase/supabase-js';

// --- REMPLACE CES DEUX LIGNES PAR TES VRAIES INFOS SUPABASE ---
// Tu les trouves dans Supabase > Settings > API
const supabaseUrl = 'https://sbkxdrdvlnrwfnnzhrxf.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNia3hkcmR2bG5yd2ZubnpocnhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2Nzg3NjIsImV4cCI6MjA4NDI1NDc2Mn0.xekfAqSVc6x6DYzwoxZmnJrLRVMF8AE7knKL_T2raf4';
// --------------------------------------------------------------

console.log("INITIALISATION SUPABASE AVEC :");
console.log("URL:", supabaseUrl);
// On n'affiche pas toute la clé par sécurité, juste pour voir si elle est là
console.log("Key (taille):", supabaseKey.length); 

export const supabase = createClient(supabaseUrl, supabaseKey);