"""Download Olist from Kaggle and convert to data/<table>.parquet.

Needs KAGGLE_API_TOKEN. Run: pip install duckdb==2.0.0 kagglehub==1.0.3 && python scripts/build_data.py
"""
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

src = pathlib.Path(kagglehub.dataset_download("olistbr/brazilian-ecommerce"))
out = pathlib.Path(__file__).resolve().parent.parent / "data"
out.mkdir(exist_ok=True)

for csv, table in TABLES.items():
    dest = out / f"{table}.parquet"
    duckdb.sql(f"COPY (SELECT * FROM read_csv('{src / csv}')) TO '{dest}' (FORMAT parquet, COMPRESSION zstd)")
    rows = duckdb.sql(f"SELECT count(*) FROM '{dest}'").fetchall()[0][0]
    print(f"{table:22} {rows:>8} rows  {dest.stat().st_size / 1e6:6.2f} MB")
