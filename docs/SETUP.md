# Setup guide: put the app online for free and share it between two people

About 15 minutes, all in the GitHub website. You'll end up with:

- **The app**: a public web page at `https://<your-github-name>.github.io/family-finance-planner/`. It contains only code, never your numbers.
- **Your data**: a single file `plan.json` in a **private** repository that only you can see. The app reads and writes it with an access key.

Cost: 0 zł. GitHub Pages is free for public repositories. A private repository is free too.

> Why two repositories? Free GitHub Pages only publishes public repositories. Keeping the data in a separate
> private repository means nobody browsing the public code or page can see your finances.

---

## 1. Create a GitHub account (skip if you have one)

Sign up at https://github.com/signup. Use your **personal** account, not a work one.

## 2. Publish the app

1. Go to https://github.com/new and create a repository:
   - Name: `family-finance-planner`
   - Visibility: **Public**
   - Don't add a README, .gitignore or license (the project already has them).
2. In a terminal on your laptop, inside this project folder, run (replace `<you>` with your GitHub name and use your
   **personal** name/e-mail, because commits in a public repository show them):

   ```bash
   git config user.name "Your Name"
   git config user.email "<you>@users.noreply.github.com"   # or your personal e-mail
   git commit -m "Family finance planner"
   git remote add origin git@github.com:<you>/family-finance-planner.git
   git push -u origin main
   ```

   The `git config` lines only affect this folder. Your work identity elsewhere stays as it is.

   (Or use GitHub Desktop: *Add existing repository* → this folder → *Publish*.)
3. In the repository on GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Open the **Actions** tab. The *Test and deploy to GitHub Pages* run takes about a minute. When it shows a green tick,
   the app is live at `https://<you>.github.io/family-finance-planner/`.

Every later push to `main` re-runs the tests and redeploys automatically. If a test fails, nothing is deployed and
the old version stays online.

## 3. Create the private data repository

1. Go to https://github.com/new again:
   - Name: `finance-data`
   - Visibility: **Private**
   - Tick **Add a README file**. The repository must not be empty, otherwise GitHub has no `main` branch yet.
2. That's it. The app creates `plan.json` in it on the first sync.

## 4. Create the shared access key

The key lets the app read and write **only** the `finance-data` repository.

1. Open https://github.com/settings/personal-access-tokens/new (Settings → Developer settings → Personal access tokens →
   **Fine-grained tokens** → *Generate new token*).
2. Fill in:
   - **Token name**: `finance app`
   - **Expiration**: the longest allowed, or *No expiration* if your account offers it. Put a calendar reminder to renew it.
   - **Repository access**: **Only select repositories** → pick `finance-data`.
   - **Permissions → Repository permissions → Contents: Read and write**. Leave everything else as is. *Metadata: Read*
     is added automatically.
3. Click **Generate token** and copy it (it starts with `github_pat_`). GitHub shows it only once. Store it in your
   password manager, because you'll paste it on each device.

## 5. Connect the first device (your laptop)

1. Open `https://<you>.github.io/family-finance-planner/`.
2. Go to **Settings → Sync between our devices (GitHub)** and fill in:
   - GitHub user / organisation: `<you>`
   - Private data repository: `finance-data`
   - Branch: `main`
   - File: `plan.json`
   - Access key: the token
3. Click **Connect — merge this device's data in**. The chip in the top bar turns to **✓ Synced**, and `plan.json`
   appears in the `finance-data` repository.

The app starts with **example data** (made-up numbers) so you can see how everything works. Replace it with your own
in **Household**, then edit or delete the example scenarios in **Scenarios**. Or use **Settings → Data → Start from
scratch**.

## 6. Connect the iPhones (yours and your partner's)

1. Open `https://<you>.github.io/family-finance-planner/` in **Safari**.
2. Tap the **Share** button → **Add to Home Screen** → **Add**. The app now opens full-screen from its own icon.
3. Open it from the home screen → **Settings** tab → fill in the same five fields (paste the token from your password
   manager).
4. Tap **Connect — use the data already on GitHub**. The phone downloads your plan and never overwrites it with the
   example data.

Do the same on your partner's phone or laptop. Each device remembers the key, so you only do this once per device.

## How syncing behaves

- Changes save on the device instantly and reach GitHub about 2–3 seconds after you stop typing.
- The app fetches the latest copy when it opens, when you switch back to it, and every 2 minutes while it's open.
- If you both edit at the same time, changes are merged: each scenario keeps the most recent edit, and the household
  and settings keep whichever was edited last.
- Offline edits stay on the device and sync once you're back online.
- Every save is a commit in `finance-data`, so you have full history. To undo, open `plan.json` → *History*, copy an
  older version, and restore it in the app via **Settings → Data → Restore from file**.
- **Settings → Data → Download backup** saves a copy as a file at any time.

## Troubleshooting

| What you see | What to do |
|---|---|
| “GitHub rejected the access key” | The token expired or was mistyped. Create a new one (step 4) and paste it on each device. |
| “Repository or branch not found” | Check the name spelling, that the token has access to `finance-data`, and that the repo has a README (step 3). |
| “The access key is not allowed…” | The token is missing *Contents: Read and write* on `finance-data`. Edit the token's permissions. |
| Page shows 404 after deploy | Wait 1–2 minutes; check Settings → Pages shows the URL; check the Actions run succeeded. |
| Changes from the other phone don't show | Pull down/close and reopen the app, or tap the sync chip → **Sync now**. |

## Security notes

- The token lives only in each browser's local storage, never in the code or the data file. Anyone holding your
  unlocked phone with the app open could see your plan. Treat it like your banking app.
- The token can only touch `finance-data`. If a device is lost, delete the token at
  https://github.com/settings/personal-access-tokens and create a new one.
- The public page is marked `noindex`, so search engines won't list it. It contains no data anyway.

## Working on the code locally (optional)

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # calculation tests
npm run build    # production build into dist/
```
