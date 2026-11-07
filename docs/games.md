# Games

Every game file we load, with its license. Only freely distributable homebrew
or public-domain games. Never a commercial game. Game files themselves live
outside the repo and are loaded with
`pnpm --dir api jobs import-games <folder> --apply`.

| Title | Console / core | Author | License | Link |
| --- | --- | --- | --- | --- |
| Bomb Sweeper v0.5 | nes fceumm | Snowbro | Public Domain | https://www.nesworld.com/article.php?system=nes&data=neshomebrew_bestof |

## Loading games

`import-games` reads a `games.json` that you write yourself, in the same folder
as the game files. It isn't in the repo, and neither are the game files. Use a
folder outside the repo, or the gitignored `games/` folder at the repo root.
Each entry names a file in that folder:

```json
[
  {
    "file": "BombSweeper.nes",
    "title": "Bomb Sweeper",
    "description": "Move the walls to clear a path to the bomb before the timer runs out.",
    "genre": "Puzzle",
    "core": "nes"
  }
]
```

Then run it from the repo root. Without `--apply` it only shows what it would
add; with `--apply` it adds it. Games already in the catalog (same title) are
skipped, so a second `--apply` imports 0. Files go to the GridFS bucket
`gameFiles`. Because of `--dir api`, a relative folder is read from `api/`, so
`../games` means the repo root's `games/` folder; an absolute path also works.

```bash
pnpm --dir api jobs import-games ../games            # dry run
pnpm --dir api jobs import-games ../games --apply
```

### Into the cluster's MongoDB

Forward the cluster's MongoDB to port 27019 in one terminal, and leave it
running:

```bash
kubectl -n arcade port-forward svc/mongo 27019:27017
```

In a second terminal, point the command at that port, then run it as above. The
variable only lasts for that terminal.

```powershell
# PowerShell. Not `set MONGO_URL=...`: that's cmd syntax, and PowerShell
# ignores it, so the command connects to the default port 27018 instead.
$env:MONGO_URL = "mongodb://localhost:27019"
pnpm --dir api jobs import-games ../games --apply
```

```bash
# bash
MONGO_URL=mongodb://localhost:27019 pnpm --dir api jobs import-games ../games --apply
```

If the error says `ECONNREFUSED ... 27018`, the variable wasn't set. If it says
`ENOENT ... games.json`, the folder has no `games.json`.
