"""Download Olist from Kaggle, convert to data/<table>.parquet, and write data/profile.json (per-table stats for the site).

Needs KAGGLE_API_TOKEN. Run: pip install duckdb==2.0.0 kagglehub==1.0.3 && python scripts/build_data.py
"""
import json
import pathlib

import duckdb
import kagglehub

# geolocation dropped: 1M rows, not needed for problems
TABLES = {
    "olist_customers_dataset.csv": "customers",
    "olist_orders_dataset.csv": "orders",
    "olist_order_items_dataset.csv": "order_items",
    "olist_order_payments_dataset.csv": "order_payments",
    "olist_order_reviews_dataset.csv": "order_reviews",
    "olist_products_dataset.csv": "products",
    "olist_sellers_dataset.csv": "sellers",
    "product_category_name_translation.csv": "category_translation",
}

# What one row means, shown above each table on the site.
GRAIN = {
    "customers": "One row per order's customer record, keyed by customer_id. The same real person has one customer_id per order; customer_unique_id identifies the person.",
    "orders": "One row per order. Each order gets its own customer_id.",
    "order_items": "One row per item in an order. An order with 3 items has 3 rows (order_item_id 1, 2, 3).",
    "order_payments": "One row per payment. An order paid with a card and a voucher has 2 rows (payment_sequential 1, 2).",
    "order_reviews": "One row per review. A few orders have more than one review, and some review_ids repeat.",
    "products": "One row per product. Category names are in Portuguese; category_translation has the English names.",
    "sellers": "One row per seller.",
    "category_translation": "One row per product category: the Portuguese name and its English translation.",
}

NUMERIC = ("bigint", "integer", "smallint", "double", "float", "decimal")
SAMPLE_ROWS = 5
TOP_VALUES = 5   # columns with more distinct values than this show their top 5; up to 10 distinct are listed in full


def profile(con, table, path):
    """Stats the site shows for one table: row count, per-column min/max/avg/median/nulls/top values, and a sample."""
    src = f"read_parquet('{path}')"
    rel = con.sql(f"SELECT * FROM {src} LIMIT {SAMPLE_ROWS}")
    columns = []
    for name, dtype in zip(rel.columns, rel.types):
        dtype = str(dtype).lower()
        col = f'"{name}"'
        numeric, timestamp = dtype.startswith(NUMERIC), dtype.startswith("timestamp")
        mn, mx, avg, median, nonnull, nulls, distinct = con.sql(f"""
            SELECT {f'min({col}), max({col})' if numeric or timestamp else 'NULL, NULL'},
                   {f'avg({col}), median({col})' if numeric else 'NULL, NULL'},
                   count({col}), count(*) - count({col}), count(DISTINCT {col}) FROM {src}""").fetchall()[0]
        unique = distinct == nonnull
        listed = distinct <= 10 or not (unique or timestamp)
        top = con.sql(f"SELECT {col}, count(*) FROM {src} WHERE {col} IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT {10 if distinct <= 10 else TOP_VALUES}").fetchall() if listed else []
        columns.append({"name": name, "type": dtype, "min": mn, "max": mx, "avg": avg, "median": median,
                        "nulls": nulls, "distinct": distinct, "unique": unique, "top": top})
    return {"rows": con.sql(f"SELECT count(*) FROM {src}").fetchall()[0][0], "grain": GRAIN[table],
            "columns": columns, "sample": rel.fetchall()}


def main():
    src = pathlib.Path(kagglehub.dataset_download("olistbr/brazilian-ecommerce"))
    out = pathlib.Path(__file__).resolve().parent.parent / "data"
    out.mkdir(exist_ok=True)
    con = duckdb.connect()
    profiles = {}
    for csv, table in TABLES.items():
        dest = out / f"{table}.parquet"
        con.sql(f"COPY (SELECT * FROM read_csv('{src / csv}')) TO '{dest}' (FORMAT parquet, COMPRESSION zstd)")
        profiles[table] = profile(con, table, dest)
        print(f"{table:22} {profiles[table]['rows']:>8} rows  {dest.stat().st_size / 1e6:6.2f} MB")
    (out / "profile.json").write_text(json.dumps(profiles, default=str))


if __name__ == "__main__":
    main()
