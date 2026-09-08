-- Separate administrative identity, pilot identity and communication mailbox.
delete from private.bootstrap_admin_emails
where email_normalized <> 'glicia.app.admin@gmail.com';

insert into private.bootstrap_admin_emails (email_normalized)
values ('glicia.app.admin@gmail.com') on conflict do nothing;

delete from public.app_admins
where user_id not in (
  select id from auth.users where lower(btrim(email)) = 'glicia.app.admin@gmail.com'
);

insert into public.access_requests (email_normalized, status, reviewed_at)
values ('glicia.app.admin@gmail.com', 'approved', now()),
       ('deniofriacamoreirajr@gmail.com', 'approved', now()),
       ('glicia.app@gmail.com', 'rejected', now())
on conflict (email_normalized) do update
set status = excluded.status, reviewed_at = now(), updated_at = now();

update public.access_requests r
set user_id = u.id
from auth.users u
where lower(btrim(u.email)) = r.email_normalized
  and r.email_normalized in ('glicia.app.admin@gmail.com', 'deniofriacamoreirajr@gmail.com', 'glicia.app@gmail.com');

insert into public.app_access_grants (user_id, access_request_id)
select user_id, id from public.access_requests
where email_normalized in ('glicia.app.admin@gmail.com', 'deniofriacamoreirajr@gmail.com')
  and user_id is not null
on conflict (user_id) do update
set revoked_at = null, access_request_id = excluded.access_request_id;

update public.app_access_grants set revoked_at = now()
where user_id in (select id from auth.users where lower(btrim(email)) = 'glicia.app@gmail.com');

insert into public.app_admins (user_id)
select id from auth.users where lower(btrim(email)) = 'glicia.app.admin@gmail.com'
on conflict do nothing;
