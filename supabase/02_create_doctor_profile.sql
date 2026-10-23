-- 1) Le médecin crée d'abord son compte dans Supabase Authentication > Users.
-- 2) Remplacez les valeurs ci-dessous. N'utilisez PAS une chaîne fictive convertie en uuid.
-- 3) L'UUID exact se copie depuis Authentication > Users.
insert into public.doctor_profiles(user_id,display_name,specialty,professional_number,city,verification_status)
values('REMPLACER_PAR_UUID_AUTH_REEL','Dr Nom Prénom','Cardiologie','NUMERO_A_VERIFIER','Tunis','pending');
-- Après contrôle manuel du justificatif professionnel :
-- update public.doctor_profiles set verification_status='verified' where user_id='UUID_AUTH_REEL';
