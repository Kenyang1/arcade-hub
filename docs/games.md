# Games

Every game file we load, with its license. Only freely distributable homebrew
or public-domain games. Never a commercial game. Game files themselves live
outside the repo and are loaded with
`pnpm --dir api jobs import-games <folder> --apply`.

| Title | Console / core | Author | License | Link |
| --- | --- | --- | --- | --- |
| Bomb Sweeper v0.5 | nes fceumm | Snowbro | Public Domain | https://www.nesworld.com/article.php?system=nes&data=neshomebrew_bestof |

## Loading games

Put the game files and a `games.json` in one folder (the gitignored `games/`
folder at the repo root works). Each entry names a file in that folder:

```json
[
  {
    "file": "bomb-sweeper.nes",
    "title": "Bomb Sweeper",
    "description": "Public-domain NES homebrew minesweeper.",
    "genre": "Puzzle",
    "core": "nes"
  }
]
```

`pnpm --dir api jobs import-games ../games` shows what it would add, and
`--apply` adds it. Games already in the catalog (same title) are skipped, so a
second run imports 0. Files go to the GridFS bucket `gameFiles`. To fill the
cluster's MongoDB, run `kubectl -n arcade port-forward svc/mongo 27019:27017`
and set `MONGO_URL=mongodb://localhost:27019` for the command.
