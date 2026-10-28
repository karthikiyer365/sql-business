# sql-business

I wanted a website that gives me proper business problems to practice my SQL on. Not just "here is the table, generate it with SQL". That's what I am building.

Live at: **https://sqlbusinessproblems.karthikiyer.info** _(pending)_

---

## 1. What it is

A SQL practice site built around **business problems, not syntax drills**.

- You get a problem statement the way an executive would ask it ("Why did repeat revenue drop in Q3?").
- You get snippets (first few rows) of each relevant table.
- You answer in **multipart queries** — each part builds toward the final answer.
- An "executive" nudges you along the way: hints framed as business guidance, not SQL answers.
- Final check: your output matches the expected result → ✅. If not, you see what the output *should look like* (shape, columns), not the answer query.

## 2. How a problem works

```
Problem statement (business context)
   |
   v
Table snippets  ->  Part 1 query  ->  check  ->  Part 2 query  ->  check  -> ... -> Final ✅
                         |                           |
                         └── exec hint on miss ──────┘
```

## 3. Dataset

[Olist Brazilian E-Commerce](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce) — ~100k real orders (2016–2018) across customers, orders, order items, payments, reviews, products, sellers, category translations. Geolocation table dropped (size).

License: CC BY-NC-SA 4.0 → this site stays non-commercial; derived data shared under same license.

## 4. Architecture

Static site. SQL runs **in the browser** (DuckDB-WASM). No backend, no data in git.

Green = built and live · dashed amber = planned · grey = outside service.

### System design

Follow the numbers: 1–4 run on GitHub when code merges, 5–14 run in each visitor's browser.

```mermaid
flowchart TB
    kaggle(["Kaggle<br/>Olist dataset"]):::ext
    jsd(["jsDelivr CDN<br/>DuckDB-WASM engine"]):::ext

    subgraph deploy["Deploy · on GitHub, when code merges"]
        repo["GitHub repo<br/>code only, no data"]:::done
        actions["GitHub Actions<br/>build job"]:::done
        cache[("Actions cache<br/>last built Parquet")]:::done
        pages["GitHub Pages<br/>static hosting"]:::done
        parquet[("data/*.parquet<br/>8 tables · 22 MB")]:::done
    end

    subgraph runtime["Runtime · in the visitor's browser"]
        visitor((Visitor)):::ext
        dns(["Netlify DNS<br/>CNAME → Pages"]):::done
        page["Query page<br/>SQL editor"]:::done
        worker["DuckDB worker<br/>runs on visitor CPU"]:::done
        views[("8 table views<br/>only bytes needed")]:::done
        grid["Results grid<br/>up to 500 rows"]:::done
        pfile[/"Problem file<br/>brief · parts · rules"/]:::plan
        pview["Problem view<br/>brief + snippets"]:::plan
        checker["Part checker<br/>fingerprint result"]:::plan
        guide["Exec guidance<br/>diagnose → hint"]:::plan
    end

    repo -- "1 push to main" --> actions
    actions <-- "2 reuse if hit" --> cache
    kaggle -- "3 download if miss" --> actions
    actions -- "4 build + publish" --> pages
    pages --- parquet

    visitor -- "5 opens URL" --> dns --> page
    parquet -- "6 page + byte ranges" --> views
    jsd -- "7 engine" --> worker
    page -- "8 SQL" --> worker
    worker -- "9 scan" --> views
    views -- "10 rows" --> grid

    pfile -. "11 brief, parts, rules" .-> pview
    grid -. "12 result" .-> checker
    checker -. "13 mismatch" .-> guide
    guide -. "14 hint" .-> pview

    classDef done fill:#e3f3ea,stroke:#1f7a4d,color:#1b211d
    classDef plan fill:#fdf2df,stroke:#a86400,stroke-dasharray:5 4,color:#1b211d
    classDef ext fill:#eef1ef,stroke:#5d6a62,color:#1b211d
```

**Deploy (live)**

1. Code merges to `main` → `.github/workflows/deploy.yml` starts.
2. Cache keyed on hash of `scripts/build_data.py`; hit → reuse Parquet, skip Kaggle.
3. Cache miss only (first run, script changed, or cache unused 7 days) → `kagglehub` downloads Olist (42.6 MB) using the `KAGGLE_API_TOKEN` secret.
4. CSVs → `data/*.parquet` (zstd, ~22 MB); site + data published to GitHub Pages.

**Runtime (live)**

5. Visitor opens the URL; Netlify DNS points it at GitHub Pages.
6. Browser loads `index.html`, then reads Parquet in byte ranges (HTTP 206) as queries need them.
7. DuckDB-WASM engine loads from jsDelivr (cached after first visit).
8. Visitor's SQL goes from the editor to the DuckDB worker.
9. Worker scans the 8 table views. `DROP`/`DELETE` only affect that tab; refresh restores.
10. Rows return to the results grid (500-row render cap).

**Problem layer (planned)**

11. Problem view loads a problem file: brief, parts, expected answers, known mistakes.
12. Each run's result also goes to the part checker, which fingerprints it.
13. On a mismatch, the checker hands the gap to exec guidance.
14. Guidance picks a hint that fits the visitor's own SQL and shows it in the problem view.

### Runtime flow

One visitor solving one problem. The right branch turns a wrong answer into a hint about what they actually wrote.

```mermaid
flowchart TD
    load["Load website<br/>page, engine, 8 table views ready"]:::done
    pick["Pick a problem<br/>library · P7"]:::plan
    brief["Read the brief and table snippets<br/>problem view · P5"]:::plan
    write["Write SQL for part N<br/>editor is live; parts are P4–P5"]:::plan
    run["Run it in the browser<br/>5–50 ms on real Olist data"]:::done
    err{"Query errored?"}:::plan
    translate["Translate the error<br/>DuckDB message → plain words + where to look"]:::plan
    fp["Fingerprint the result<br/>columns · row count · sha256 of rows"]:::plan
    match{"Matches expected?"}:::plan
    more{"More parts?"}:::plan
    solved["Problem solved ✅<br/>final output confirmed"]:::plan
    shape["1 · Compare result shape<br/>columns → row count → values"]:::plan
    readsql["2 · Read the SQL they wrote<br/>json_serialize_sql: tables, columns, filters"]:::plan
    rules["3 · Check this part's known mistakes<br/>rules in the problem file"]:::plan
    rule{"Rule matched?"}:::plan
    target["Targeted exec hint<br/>names their exact mistake"]:::plan
    ladder["Next hint on the ladder<br/>general → specific, one step per miss"]:::plan
    show["Show hint + expected shape<br/>in the exec's voice"]:::plan

    load --> pick --> brief --> write --> run --> err
    err -- "yes" --> translate
    translate -- "fix and rerun" --> write
    err -- "no" --> fp --> match
    match -- "yes" --> more
    more -- "yes: next part" --> write
    more -- "no" --> solved
    match -- "no" --> shape --> readsql --> rules --> rule
    rule -- "yes" --> target --> show
    rule -- "no" --> ladder --> show
    show -- "try again" --> write

    classDef done fill:#e3f3ea,stroke:#1f7a4d,color:#1b211d
    classDef plan fill:#fdf2df,stroke:#a86400,stroke-dasharray:5 4,color:#1b211d
```

**How hints stay relevant (planned):** four checks run in the browser in order; the first that finds something decides the hint.

| Check | Looks at | Example exec hint |
|---|---|---|
| Error | DuckDB error message | "There's no order_value. Money lives in order_items.price and order_payments.payment_value." |
| Shape | Column names + row count vs expected | "You handed me a list. I asked for one number." |
| Their SQL | Tables, columns, filters, grouping via `json_serialize_sql` | "Every order gets a fresh customer_id. The real person is customer_unique_id." |
| Ladder | Nothing specific matched | Next hint for this part, more specific each miss |

| Who | Talks to | When |
|---|---|---|
| GitHub Actions | Kaggle | Cache miss only |
| GitHub Actions | Pages | Every deploy |
| Browser | Pages, jsDelivr | Every visit |
| Browser | Kaggle | Never |

## 5. Problem format

_TBD_ — each problem = statement, tables used, parts (prompt + expected result + hints), final expected output.

## 6. Hosting

- GitHub Pages (source: GitHub Actions), custom subdomain `sqlbusinessproblems.karthikiyer.info`.
- DNS: `CNAME sqlbusinessproblems → karthikiyer365.github.io` in Netlify DNS (zone `karthikiyer.info`), same pattern as `projects` / `writing`.

## 7. Local development

_TBD_

## 8. Adding a problem

_TBD_

## 9. Roadmap

- [ ] Pick dataset + SQL engine
- [ ] Subdomain live on Netlify
- [ ] First problem end-to-end
- [ ] Hint flow
- [ ] Problem library

## 10. Design

### Color palette: Mocha (final)

Dark theme. Brown and green from the coffee/ledger world, fuchsia for highlights, maroon for errors.

| Role | Token | Hex | Used for |
|---|---|---|---|
| Background | `--bg` | `#1C1714` | Page |
| Surface | `--surface` | `#26201C` | Cards, top bar |
| Border | `--line` | `#3A312B` | Card edges, table rules |
| Text | `--fg` | `#EFE6DA` | Body text |
| Muted | `--muted` | `#A8998A` | Labels, secondary text |
| Code background | `--code` | `#211B18` | SQL editor, table headers |
| Brown (primary) | `--primary` | `#C08A5A` | Run button, SQL keywords, current part |
| Green (correct) | `--ok` | `#7FB38E` | Correct verdict, solved parts, SQL strings |
| Green fill | `--ok-bg` | `#1F2E24` | Correct verdict background |
| Fuchsia highlight | `--neon` | `#FF1FA6` | Hint border + glow, active tag edge, SQL numbers |
| Fuchsia tint | `--soft` | `#6A0D47` | Exec avatar, active tag fill |
| Hint fill | `--hint-bg` | `#3A0C2A` | "Not quite" verdict background |
| Maroon edge | `--err` | `#A0182E` | Error verdict border |
| Maroon fill | `--err-bg` | `#4A0A16` | Error verdict background |
| Error text | `--err-text` | `#FF8A96` | Error verdict title |

**Rules**

- Maroon is too dark to read as text on this background → only fills and borders; error titles use `--err-text`.
- Fuchsia is for highlights (borders, glow, small accents), not body text.
- Green means correct, nothing else.
- Fonts not chosen yet.

```css
:root {
  color-scheme: dark;
  --bg: #1C1714; --surface: #26201C; --line: #3A312B; --code: #211B18;
  --fg: #EFE6DA; --muted: #A8998A;
  --primary: #C08A5A; --on-primary: #1C1714;
  --ok: #7FB38E; --ok-bg: #1F2E24;
  --neon: #FF1FA6; --soft: #6A0D47; --hint-bg: #3A0C2A;
  --err: #A0182E; --err-bg: #4A0A16; --err-text: #FF8A96;
}
```

## License

See [LICENSE](LICENSE). Dataset license noted in section 3 once chosen.
