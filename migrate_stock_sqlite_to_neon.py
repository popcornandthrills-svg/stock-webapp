from __future__ import annotations

import os
import sqlite3
from pathlib import Path

try:
    import psycopg
    from psycopg.rows import dict_row
except Exception as exc:  # pragma: no cover
    raise SystemExit(f"psycopg is required: {exc}")


def main() -> None:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise SystemExit("DATABASE_URL is required")

    source_db = Path(os.getenv("SOURCE_DB_PATH", "stock.db")).expanduser().resolve()
    if not source_db.exists():
        raise SystemExit(f"Source SQLite DB not found: {source_db}")

    sqlite = sqlite3.connect(str(source_db))
    sqlite.row_factory = sqlite3.Row
    pg = psycopg.connect(database_url, row_factory=dict_row)
    pg.autocommit = False

    points = sqlite.execute("SELECT id, name, is_ho FROM points ORDER BY id").fetchall()
    items = sqlite.execute("SELECT * FROM items ORDER BY id").fetchall()
    balances = sqlite.execute("SELECT point_id, item_id, qty FROM balances ORDER BY point_id, item_id").fetchall()
    local_point_names = {int(point["id"]): str(point["name"]) for point in points}

    with pg:
        with pg.cursor() as cur:
            point_name_to_id: dict[str, int] = {}
            for point in points:
                existing = cur.execute(
                    "SELECT id FROM points WHERE UPPER(name)=UPPER(%s)",
                    (point["name"],),
                ).fetchone()
                if existing:
                    point_id = int(existing["id"])
                    cur.execute(
                        "UPDATE points SET is_ho=%s WHERE id=%s",
                        (int(point["is_ho"] or 0), point_id),
                    )
                else:
                    row = cur.execute(
                        "INSERT INTO points(name, is_ho) VALUES (%s, %s) RETURNING id",
                        (point["name"], int(point["is_ho"] or 0)),
                    ).fetchone()
                    point_id = int(row["id"])
                point_name_to_id[str(point["name"]).upper()] = point_id

            item_id_map: dict[int, int] = {}
            created_items = 0
            updated_items = 0
            for item in items:
                art_no = str(item["art_no"] or "").strip().upper()
                if not art_no:
                    continue
                existing = cur.execute(
                    "SELECT id FROM items WHERE UPPER(art_no)=UPPER(%s)",
                    (art_no,),
                ).fetchone()
                if existing:
                    item_id = int(existing["id"])
                    cur.execute(
                        """
                        UPDATE items
                        SET batch_no=%s,
                            design_no=%s,
                            item_name=%s,
                            category=%s,
                            wholesale=%s,
                            retail=%s,
                            reorder_level=%s,
                            description=%s,
                            updated_at=%s
                        WHERE id=%s
                        """,
                        (
                            str(item["batch_no"] or ""),
                            str(item["design_no"] or ""),
                            str(item["item_name"] or ""),
                            str(item["category"] or ""),
                            float(item["wholesale"] or 0),
                            float(item["retail"] or 0),
                            int(item["reorder_level"] or 0),
                            str(item["description"] or ""),
                            str(item["updated_at"] or item["created_at"] or ""),
                            item_id,
                        ),
                    )
                    updated_items += 1
                else:
                    row = cur.execute(
                        """
                        INSERT INTO items(
                            art_no, batch_no, design_no, item_name, category,
                            wholesale, retail, reorder_level, description, created_at, updated_at
                        )
                        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        RETURNING id
                        """,
                        (
                            art_no,
                            str(item["batch_no"] or ""),
                            str(item["design_no"] or ""),
                            str(item["item_name"] or ""),
                            str(item["category"] or ""),
                            float(item["wholesale"] or 0),
                            float(item["retail"] or 0),
                            int(item["reorder_level"] or 0),
                            str(item["description"] or ""),
                            str(item["created_at"] or ""),
                            str(item["updated_at"] or item["created_at"] or ""),
                        ),
                    ).fetchone()
                    item_id = int(row["id"])
                    created_items += 1
                item_id_map[int(item["id"])] = item_id
        pg.commit()

        copied_balances = 0
        for chunk_start in range(0, len(balances), 100):
            chunk = balances[chunk_start : chunk_start + 100]
            with pg.cursor() as cur:
                for balance in chunk:
                    new_item_id = item_id_map.get(int(balance["item_id"]))
                    if not new_item_id:
                        continue
                    point_name = str(local_point_names.get(int(balance["point_id"]), "")).upper()
                    if not point_name:
                        continue
                    new_point_id = point_name_to_id.get(point_name)
                    if not new_point_id:
                        row = cur.execute(
                            "INSERT INTO points(name, is_ho) VALUES (%s, %s) RETURNING id",
                            (local_point_names[int(balance["point_id"])], 0),
                        ).fetchone()
                        new_point_id = int(row["id"])
                        point_name_to_id[point_name] = new_point_id
                    cur.execute(
                        """
                        INSERT INTO balances(point_id, item_id, qty)
                        VALUES(%s, %s, %s)
                        ON CONFLICT(point_id, item_id) DO UPDATE SET qty=excluded.qty
                        """,
                        (new_point_id, new_item_id, int(balance["qty"] or 0)),
                    )
                    copied_balances += 1
            pg.commit()

    print(
        {
            "source_db": str(source_db),
            "items_source": len(items),
            "balances_source": len(balances),
            "items_created": created_items,
            "items_updated": updated_items,
            "balances_copied": copied_balances,
        }
    )


if __name__ == "__main__":
    main()
