# 📝 QuickNotes — Supabase‑backed Note‑Taking App

A lightweight, modern note‑taking app with email magic‑link authentication and per‑user cloud sync via Supabase.

> ✨ Built for developers and learners exploring full-stack web apps with modern cloud APIs.

---

## 🚀 Tech Stack

| Layer | Technology |
|:------|:------------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (ES6+) |
| **Backend (as-a-Service)** | [Supabase](https://supabase.com) — Database, Auth, API |
| **Optional Server** | Java HTTP Utility Server |
| **Database** | PostgreSQL (via Supabase) |
| **Auth** | Supabase Magic-Link Email Authentication |

---

## ✨ Features

- ✅ Notes: Create, edit, and delete notes (title + content)
- ✅ Auth: Email magic link sign‑in/sign‑out
- ✅ Cloud sync: Per‑user notes stored in Supabase (`public.notes`)
- ✅ Modal editor: Clean create/edit dialog
- ✅ Responsive & accessible UI

---

## 📁 Project Structure

- `index.html` — App shell, auth section, notes list, and modal markup
- `styles.css` — Modern styling, responsive layout
- `app.js` — Auth handling, Supabase CRUD for notes, UI rendering
- `config.js` — Set `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- `TaskUtilServer.java` — local Java utility server

---

## 💻 Run Locally

1) Install/start a static server in the project directory.

2) Open `http://localhost:3000` in your browser.

---

## ⚙️ Configure Supabase

1) In the Supabase dashboard, copy your Project URL and anon key, then set them in `config.js`:

```js
window.SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
window.SUPABASE_ANON_KEY = 'YOUR_PUBLIC_ANON_KEY';
```

2) Authentication → Settings → URL Configuration:
- Site URL: `http://localhost:3000`
- Add the same to Redirect URLs.

3) Enable Email provider (magic link) in Authentication → Providers.

4) Create the `notes` table with RLS and policies:

```sql
create table if not exists public.notes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  created timestamptz not null default now()
);

alter table public.notes enable row level security;

create policy "notes_select_own" on public.notes
  for select using (auth.uid() = user_id);

create policy "notes_insert_own" on public.notes
  for insert with check (auth.uid() = user_id);

create policy "notes_update_own" on public.notes
  for update using (auth.uid() = user_id);

create policy "notes_delete_own" on public.notes
  for delete using (auth.uid() = user_id);
```

---

## 🪶 Usage

1) On the app page, enter your email → “Send login link”.
2) Click the magic link in your email to return and sign in.
3) Click “Create Note” to add a note; edit or delete using the buttons on each note.

Notes are stored per user in `public.notes` and will reload whenever you sign in again.

---

## ☕ Java Utility Server

You can run a small Java HTTP server if you want a Java component:

```bash
javac TaskUtilServer.java && java TaskUtilServer
```

It listens on `http://localhost:8787` and exposes simple endpoints. The app does not depend on it for note IDs.

---

## 🧰 Troubleshooting

- ❌ Magic link doesn’t sign you in:
  - Ensure Site URL and Redirect URLs in Supabase match your local origin exactly (e.g., `http://localhost:3000`).
  - Try a hard refresh after clicking the magic link.
- ❌ Insert/Select errors:
  - Verify `public.notes` exists and RLS policies are applied as above.
  - Open DevTools → Network → check `rest/v1/notes` response for errors.

---

## 📜 License

This project is open-source under the MIT License — free to use, modify, and share.
