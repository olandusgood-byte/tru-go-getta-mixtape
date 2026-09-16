create index if not exists tgg_browser_cert_evidence_worker_id_idx
  on public.tgg_browser_cert_evidence(worker_id);

create index if not exists tgg_browser_cert_jobs_leased_by_idx
  on public.tgg_browser_cert_jobs(leased_by);

create index if not exists tgg_browser_certificates_worker_id_idx
  on public.tgg_browser_certificates(worker_id);
