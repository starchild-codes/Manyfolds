-- Every table in the exposed public schema must have RLS enabled. The browser
-- uses Supabase for auth only; application data APIs run on the server.
do $$
declare
  table_name text;
begin
  for table_name in
    select class.relname
    from pg_class as class
    join pg_namespace as namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relkind in ('r', 'p')
      and not class.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
  end loop;
end $$;

-- The common career catalogue remains readable to signed-in and anonymous
-- clients. Writes continue through the server's privileged database connection.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'admission_cutoffs',
    'admission_cycles',
    'career_course_links',
    'career_pathway_steps',
    'career_pathways',
    'career_subject_links',
    'career_taxonomy',
    'careers',
    'college_program_admission_routes',
    'college_program_application_cycles',
    'college_program_costs',
    'college_program_documents',
    'college_program_exam_requirements',
    'college_program_scholarships',
    'course_subject_links',
    'courses',
    'exam_course_links',
    'examination_cycles',
    'exams',
    'institution_programme_eligibility',
    'institution_programme_fees',
    'institution_programme_sources',
    'institution_programmes',
    'institutions',
    'scholarships',
    'sources',
    'subjects',
    'universities'
  ] loop
    execute format('drop policy if exists "public read catalogue" on public.%I', table_name);
    execute format('create policy "public read catalogue" on public.%I for select to anon, authenticated using (true)', table_name);
    execute format('grant select on table public.%I to anon, authenticated', table_name);
  end loop;
end $$;
