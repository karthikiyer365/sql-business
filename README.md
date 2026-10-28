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

_TBD — proposed:_ static site, SQL runs **in the browser** (WASM database). No backend, no user DB access, no server to secure.

## 5. Problem format

_TBD_ — each problem = statement, tables used, parts (prompt + expected result + hints), final expected output.

## 6. Hosting

- Netlify, custom subdomain `sqlbusinessproblems.karthikiyer.info` (zone `karthikiyer.info` on Netlify DNS).

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

## License

See [LICENSE](LICENSE). Dataset license noted in section 3 once chosen.
