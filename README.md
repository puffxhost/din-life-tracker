# din.

**Your life, in rhythm.** Din is a calm, private daily journal for meals, workouts, medicine, tasks, moods, plans and the small things in between. It is built as a static website, so it can be hosted on GitHub Pages for free with no server or database to maintain.

> **Your journal is private to your browser.** Entries and preferences are saved in that browser's local storage. They are not uploaded to GitHub or sent to a Din server. Use **Export** regularly to keep a backup; use the round profile button to restore a backup. Clearing browser data or switching devices without a backup will remove access to those entries.

## Try it

Open `index.html` in a modern browser, or publish the project to GitHub Pages:

1. Create a GitHub repository and add these project files to its default branch.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, select **GitHub Actions**.
4. The included workflow deploys the site when changes are pushed to `main`. Find the live link under **Settings → Pages** after the first deployment finishes.

No build step, package install, API key or account is needed. The project includes a deploy workflow at `.github/workflows/pages.yml`.

## What you can track

- **Food and meals:** what you ate, the meal, and an optional amount.
- **Movement:** a workout, duration, and optional sets or distance. A missed session can be recorded as a daily task.
- **Medicine:** name, dose, time, and whether you took it or skipped it.
- **Plans and travel:** the plan, destination, time, and who is going.
- **Daily tasks, notes, and mood.**
- A day timeline, search and category filters, a seven-day activity chart, category breakdown, and day summary.
- JSON export and restore for moving or backing up your journal.

## Time and date rules

The current local date and time are the default. You cannot add an entry in the future. If you choose a time that has already passed, Din asks you to confirm before saving it. This includes earlier times today and dates in the past. Older activity stays labelled with the date and time you chose.

## Language

The interface starts in Hindi and includes a language switch for English. The chosen language is remembered in that browser.

## Run locally

You can open `index.html` directly. For a local web server, from this folder run:

```sh
python -m http.server 8000
```

Then open <http://localhost:8000>.

## License

MIT. See [LICENSE](LICENSE).
