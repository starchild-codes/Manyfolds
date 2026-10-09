-- Legacy student and diagnostic tables are currently server-owned. Block direct
-- client access until each feature has explicit tenant-aware policies.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'admissions_checklists',
    'counsellor_overrides',
    'diagnostic_answers',
    'diagnostic_sessions',
    'recommendation_explanations',
    'recommendation_runs',
    'recommendation_scores',
    'recommendation_weight_configs',
    'roadmap_alternatives',
    'student_academic_records',
    'student_career_matches',
    'student_college_matches',
    'student_constraints',
    'student_course_matches',
    'student_exam_matches',
    'student_existing_options',
    'student_financial_profiles',
    'student_geography_profiles',
    'student_roadmap_options',
    'student_route_preferences',
    'student_scholarship_matches',
    'student_skills',
    'student_subject_preferences',
    'student_values',
    'student_work_preferences'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
  end loop;
end $$;

-- These privileges are not constrained by row policies.
do $$
declare
  table_name text;
begin
  for table_name in
    select distinct columns.table_name
    from information_schema.columns as columns
    where columns.table_schema = 'public'
      and columns.column_name in ('organisation_id','user_id','counsellor_external_id')
  loop
    execute format('revoke truncate, references, trigger on table public.%I from anon, authenticated', table_name);
  end loop;
end $$;
